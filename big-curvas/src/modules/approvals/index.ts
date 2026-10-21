// API pública de ApprovalsService (docs/03 §6.4, RF-AUT-01 a 07). Las pantallas y los módulos solicitantes (sales)
// importan solo desde aquí. `approvals` NO ejecuta la acción aprobada: la ejecuta el módulo solicitante con el
// approvalId como credencial de un solo uso (`consumeApproval`, dentro de su transacción).

export { createApprovalRequest, type CreateApprovalInput } from "./requests";
export { approveRequest, rejectRequest, approveWithPin } from "./decisions";
export { consumeApproval } from "./consume";
export { getApprovalStatus, listApprovals, countPendingApprovals, listApprovers } from "./queries";
export { hashPin, verifyPin } from "./pin";
export type { ApprovalDisplay, ApprovalPayload, ApprovalView, ApproverOption, ApprovalStatus, ApprovalType, ApprovalMethod } from "./types";
