import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ConfirmTransactionsRequest,
  CreateTransactionRequest,
  CreateTransferRequest,
  Transaction,
  Transfer,
  UpdateTransactionRequest,
} from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus } from '../../core/data/refresh-bus';

/** What a movement write can change. */
const AFFECTED: DataKey[] = ['movements', 'accounts', 'dashboard', 'goals'];

/** Writes of incomes, expenses and transfers. */
@Injectable({ providedIn: 'root' })
export class TransactionsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  async create(request: CreateTransactionRequest): Promise<Transaction> {
    return this.write(this.http.post<Transaction>(`${API}/transactions`, request));
  }

  async update(id: string, changes: UpdateTransactionRequest): Promise<Transaction> {
    return this.write(this.http.patch<Transaction>(`${API}/transactions/${id}`, changes));
  }

  async remove(id: string): Promise<void> {
    await this.write(this.http.delete<void>(`${API}/transactions/${id}`));
  }

  /** MOV-05: confirms pending movements, optionally with a corrected amount. */
  async confirm(items: ConfirmTransactionsRequest['items']): Promise<Transaction[]> {
    return this.write(this.http.post<Transaction[]>(`${API}/transactions/confirm`, { items }));
  }

  async transfer(request: CreateTransferRequest): Promise<Transfer> {
    return this.write(this.http.post<Transfer>(`${API}/transfers`, request));
  }

  async removeTransfer(id: string): Promise<void> {
    await this.write(this.http.delete<void>(`${API}/transfers/${id}`));
  }

  private async write<T>(request: Observable<T>): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate(...AFFECTED);
    return result;
  }
}
