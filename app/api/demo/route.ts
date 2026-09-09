// The unrestricted V1 endpoint must not remain a bypass around role-specific APIs.
export function GET() {
  return Response.json({ error: 'ENDPOINT_RETIRED' }, { status: 410 });
}
export const POST = GET;
