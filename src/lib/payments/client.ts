export type MPSubscription = { id: string; external_reference: string; collector_id: number; status: string; last_modified: string; auto_recurring: { currency_id: string; transaction_amount: number; frequency: number; frequency_type: string }; init_point?: string };
export type MPPayment = { id: number; external_reference: string; collector_id: number; status: string; date_last_updated: string; date_approved: string | null; currency_id: string; transaction_amount: number; transaction_amount_refunded?: number; live_mode: boolean; metadata?: { preapproval_id?: string } };
export type MPInvoice = { id: number; preapproval_id: string; payment?: { id: number }; debit_date: string; last_modified: string };
export class MercadoPagoClient {
  constructor(private token: string, private fetcher: typeof fetch = fetch) {}
  async request<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Ruta de proveedor inválida');
    const response = await this.fetcher(`https://api.mercadopago.com${path}`, {
      method, cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(key ? { 'X-Idempotency-Key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Mercado Pago no completó la solicitud (HTTP ${response.status})`);
    return response.json() as Promise<T>;
  }
  subscription(id: string) { return this.request<MPSubscription>(`/preapproval/${encodeURIComponent(id)}`); }
  payment(id: string) { return this.request<MPPayment>(`/v1/payments/${encodeURIComponent(id)}`); }
  invoice(id: string) { return this.request<MPInvoice>(`/authorized_payments/${encodeURIComponent(id)}`); }
}
