import { parseTrainingSample, parseSampleReview } from '@feedsieve/shared';
import { hashInstallationId, hashIp, sha256Hex } from './lib/hash';
import { nowSeconds, utcToday } from './lib/time';

export async function ingestTrainingSamples(env: Cloudflare.Env, raw: unknown, ip?: string) {
  const b = raw as Record<string, unknown> | null;
  if (
    !b ||
    typeof b.installation_id !== 'string' ||
    b.installation_id.length < 8 ||
    b.installation_id.length > 128 ||
    !Array.isArray(b.samples) ||
    b.samples.length < 1 ||
    b.samples.length > 20
  ) {
    return { status: 400 as const, body: { error: 'invalid_samples_request' } };
  }
  const now = nowSeconds();
  const rejected: Array<{ eventId: string | null; error: string }> = [];
  const samples = b.samples
    .map((raw) => {
      const sample = parseTrainingSample(raw);
      if (sample && sample.actedAt <= now * 1000 + 300_000) return sample;
      const id =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>).eventId : undefined;
      rejected.push({
        eventId: typeof id === 'string' && id.length === 36 ? id : null,
        error: 'invalid_sample',
      });
      return null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  if (!samples.length)
    return { status: 200 as const, body: { accepted: [] as string[], rejected } };
  const identity = await hashInstallationId(env.INSTALLATION_SALT, b.installation_id);
  // Charge requests including retries: bounded immutable history even for already-voting accounts.
  for (const [key, limit] of [
    ...(ip ? [[`ip:${await hashIp(env.INSTALLATION_SALT, ip)}`, 1000]] : []),
    [`install:${identity}`, 300],
  ] as [string, number][]) {
    const used = await env.DB.prepare(
      `INSERT INTO training_sample_usage(identity, day, count) VALUES (?1, ?2, ?3)
      ON CONFLICT(identity, day) DO UPDATE SET count = count + excluded.count WHERE count + excluded.count <= ?4`,
    )
      .bind(key, utcToday(), samples.length, limit)
      .run();
    if (!used.meta.changes) return { status: 429 as const, body: { error: 'rate_limited' } };
  }
  const statements: D1PreparedStatement[] = [];
  for (const s of samples) {
    if (!s) continue;
    const contentHash = await sha256Hex(
      JSON.stringify([s.text ?? '', s.displayName ?? '', s.bio ?? '']),
    );
    statements.push(
      env.DB.prepare(
        `INSERT INTO training_samples
      (installation_id,event_id,handle,action,observed_at,received_at,content_hash,payload)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(installation_id,event_id) DO NOTHING`,
      ).bind(
        identity,
        s.eventId,
        s.handle,
        s.action,
        s.observedAt,
        now,
        contentHash,
        JSON.stringify(s),
      ),
    );
  }
  await env.DB.batch(statements);
  return { status: 200 as const, body: { accepted: samples.map((s) => s.eventId), rejected } };
}

export async function listTrainingSamples(
  env: Cloudflare.Env,
  after = 0,
  limit = 50,
  until?: number,
  reviewUntil?: number,
) {
  const bounds = await env.DB.prepare(
    'SELECT (SELECT COALESCE(MAX(id),0) FROM training_samples) AS samples, (SELECT COALESCE(MAX(id),0) FROM training_sample_reviews) AS reviews',
  ).first<{ samples: number; reviews: number }>();
  const maxId = until ?? bounds!.samples;
  const maxReviewId = reviewUntil ?? bounds!.reviews;
  const rows = await env.DB.prepare(
    `SELECT s.id, s.received_at, s.content_hash, s.payload,
      r.id AS review_id, r.verdict, r.family, r.tags, r.note, r.created_at AS reviewed_at
    FROM training_samples s LEFT JOIN training_sample_reviews r ON r.id =
      (SELECT MAX(id) FROM training_sample_reviews WHERE sample_id = s.id AND id <= ?4)
    WHERE s.id > ?1 AND s.id <= ?3 ORDER BY s.id LIMIT ?2`,
  )
    .bind(after, Math.min(200, Math.max(1, limit)), maxId, maxReviewId)
    .all<{
      id: number;
      received_at: number;
      content_hash: string;
      payload: string;
      review_id: number | null;
      verdict: string | null;
      family: string | null;
      tags: string | null;
      note: string | null;
      reviewed_at: number | null;
    }>();
  const entries = rows.results.map(({ payload, tags, ...r }) => ({
    ...r,
    tags: tags ? JSON.parse(tags) : [],
    sample: JSON.parse(payload),
  }));
  return {
    schema_version: 1,
    until: maxId,
    review_until: maxReviewId,
    entries,
    next_cursor: entries.length ? entries.at(-1)!.id : null,
  };
}

export async function reviewTrainingSample(
  env: Cloudflare.Env,
  id: number,
  raw: unknown,
  actor: string,
) {
  const review = parseSampleReview(raw);
  if (!Number.isSafeInteger(id) || id <= 0 || !review) return false;
  const result = await env.DB.prepare(
    `INSERT INTO training_sample_reviews(sample_id,verdict,family,tags,note,reviewer,created_at)
    SELECT id,?2,?3,?4,?5,?6,?7 FROM training_samples WHERE id=?1`,
  )
    .bind(
      id,
      review.verdict,
      review.family,
      JSON.stringify(review.tags),
      review.note,
      actor,
      nowSeconds(),
    )
    .run();
  return !!result.meta.changes;
}
