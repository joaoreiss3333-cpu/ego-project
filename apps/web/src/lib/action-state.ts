/** Resultado de uma Server Action, seguro para o cliente. */
export interface ActionState<T = unknown> {
  ok: boolean;
  message: string;
  /** Marca de tempo para o cliente reagir a cada envio, mesmo com a mesma mensagem. */
  at: number;
  data?: T;
}

export const IDLE: ActionState = { ok: true, message: '', at: 0 };

export type FormActionFn<T = unknown> = (prev: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;
