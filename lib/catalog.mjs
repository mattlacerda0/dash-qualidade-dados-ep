/**
 * Catálogo de campos — Dados não preenchidos por EP.
 * Sem dependências de servidor; seguro para o módulo da página.
 */

export const EP_UNFILLED_MIN_PORTFOLIO = 5;

export const EP_UNFILLED_STATUS_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "cancelled", label: "Cancelados" },
  { value: "frozen", label: "Congelados" },
  { value: "all", label: "Todos" },
];

export const EP_UNFILLED_DOMAINS = [
  "Cliente",
  "Financeiro",
  "Jornada",
  "Reuniões",
  "Tarefas",
  "Mecanismos",
];

export const EP_UNFILLED_SEVERITY_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "high", label: "Alto (≥85%)" },
  { value: "medium", label: "Médio (60–84,9%)" },
  { value: "low", label: "Baixo (<60%)" },
];

/** Campos do gráfico “Lacunas de preenchimento dos principais campos”. */
export const EP_UNFILLED_PRIORITY_FIELD_IDS = [
  "email",
  "phone",
  "cpf",
  "data_inicio_ciclo",
  "objetivo_principal",
  "segmentacao",
  "ultima_renda_mensal",
  "ultimo_aporte",
  "reserva_liquidez",
  "valor_imoveis_quitados",
  "has_journey",
  "has_journey_stage",
  "has_meeting",
  "has_checkpoint",
  "has_mechanism",
  "has_mechanism_implemented",
];

export const EP_UNFILLED_PRIORITY_CHART_LIMIT = 10;

/** Campos cadastrais atribuíveis à carteira do EP. */
export const EP_UNFILLED_CATALOG = [
  { id: "email", domain: "Cliente", label: "E-mail", column: "email", includeBlank: true },
  { id: "phone", domain: "Cliente", label: "Telefone", column: "phone", includeBlank: true },
  { id: "cpf", domain: "Cliente", label: "CPF", column: "cpf", includeBlank: true },
  { id: "data_inicio_ciclo", domain: "Cliente", label: "Início do ciclo", column: "data_inicio_ciclo" },
  { id: "data_fim_ciclo", domain: "Cliente", label: "Fim do ciclo", column: "data_fim_ciclo" },
  { id: "data_aniversario", domain: "Cliente", label: "Aniversário", column: "data_aniversario" },
  { id: "profissao", domain: "Cliente", label: "Profissão", column: "profissao", includeBlank: true },
  { id: "objetivo_principal", domain: "Cliente", label: "Objetivo principal", column: "objetivo_principal", includeBlank: true },
  { id: "segmentacao", domain: "Cliente", label: "Segmentação", column: "segmentacao", includeBlank: true },
  { id: "anotacoes", domain: "Cliente", label: "Anotações", column: "anotacoes", includeBlank: true },
  { id: "drive_link", domain: "Cliente", label: "Link do Drive", column: "drive_link", includeBlank: true },
  { id: "hobbies", domain: "Cliente", label: "Hobbies", column: "hobbies", includeBlank: true },
  { id: "nome_conjuge", domain: "Cliente", label: "Nome do cônjuge", column: "nome_conjuge", includeBlank: true },
  { id: "telefone_conjuge", domain: "Cliente", label: "Telefone do cônjuge", column: "telefone_conjuge", includeBlank: true },
  { id: "cidade", domain: "Cliente", label: "Cidade", column: "cidade", includeBlank: true },
  { id: "estado", domain: "Cliente", label: "Estado", column: "estado", includeBlank: true },
  { id: "has_financial", domain: "Financeiro", label: "Possui ficha financeira", kind: "presence" },
  { id: "ultima_renda_mensal", domain: "Financeiro", label: "Renda mensal", column: "ultima_renda_mensal", source: "financial" },
  { id: "ultimo_aporte", domain: "Financeiro", label: "Último aporte", column: "ultimo_aporte", source: "financial" },
  { id: "reserva_liquidez", domain: "Financeiro", label: "Reserva de liquidez", column: "reserva_liquidez", source: "financial" },
  { id: "valor_imoveis_quitados", domain: "Financeiro", label: "Imóveis quitados", column: "valor_imoveis_quitados", source: "financial" },
  { id: "hub_link", domain: "Financeiro", label: "Link do hub", column: "hub_link", source: "financial", includeBlank: true },
  { id: "has_journey", domain: "Jornada", label: "Jornada iniciada", kind: "presence" },
  { id: "has_journey_stage", domain: "Jornada", label: "Etapa atual da jornada", kind: "presence" },
  { id: "has_meeting", domain: "Reuniões", label: "Possui reunião", kind: "presence" },
  { id: "has_checkpoint", domain: "Reuniões", label: "Checkpoint com status", kind: "presence" },
  { id: "has_task", domain: "Tarefas", label: "Possui tarefa", kind: "presence" },
  { id: "has_mechanism", domain: "Mecanismos", label: "Possui mecanismo", kind: "presence" },
  { id: "has_mechanism_implemented", domain: "Mecanismos", label: "Mecanismo com valor ou data de implementação", kind: "presence" },
];
