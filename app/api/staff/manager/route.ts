import { handleOrderRequest } from '@/lib/order-api';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleOrderRequest(request, 'manager');
export const POST = GET;
