# Relatório de bugs não identificados — NanoTask

Data: 2026-03-12  
Escopo: revisão estática do front-end (JS/HTML) e validações rápidas de sintaxe.

## 1) Exploit de XP infinito ao reabrir e concluir novamente tarefas/subtarefas

**Severidade:** Alta (impacta progressão e integridade do ranking/gamificação).

### Evidência técnica
- A lógica de “primeira conclusão” em tarefas usa apenas `done === false && completed_at === null`.【F:tasks.js†L224-L227】
- Ao reabrir, `completed_at` volta para `null`, reabilitando a mesma condição para ganho de XP na próxima conclusão.【F:tasks.js†L228-L230】
- O mesmo padrão é usado para subtarefas.【F:tasks.js†L316-L323】

### Impacto
Usuário pode farmar XP repetindo ciclo de concluir/reabrir indefinidamente.

### Recomendação
Persistir um marcador imutável de primeira conclusão (ex.: `first_completed_at` no banco) e usar esse campo como fonte de verdade para concessão de XP.

---

## 2) Ordenação inconsistente no Kanban após drag-and-drop

**Severidade:** Alta (ordem visual diverge após reload).

### Evidência técnica
- O drag-and-drop persiste apenas a posição da tarefa movida (`taskId`) e não reindexa as demais tarefas da coluna de origem/destino.【F:tasks.js†L205-L213】

### Impacto
- Colisões de `position` no banco.
- Reordenação inesperada após recarregar sessão (ordem não determinística em empates).

### Recomendação
Ao mover uma tarefa, persistir lote com reindexação completa das colunas afetadas (origem e destino).

---

## 3) Migração de tarefas ao excluir coluna sem recalcular `position`

**Severidade:** Média/Alta.

### Evidência técnica
- Ao excluir coluna, tarefas são movidas apenas com `column_id` novo; `position` não é recalculado no destino.【F:tasks.js†L521-L529】

### Impacto
Acúmulo de posições inválidas/duplicadas na coluna destino, quebrando previsibilidade da ordenação.

### Recomendação
Durante a migração, atribuir posições sequenciais no destino (append estável), persistindo `column_id` + `position`.

---

## 4) Falha silenciosa no carregamento de colunas

**Severidade:** Média.

### Evidência técnica
- `loadAll()` executa `loadColumns()` em `Promise.allSettled`, mas não trata `columnsRes.status === 'rejected'`.【F:auth.js†L223-L228】
- Erros de coluna ficam sem feedback ao usuário e sem fallback explícito.

### Impacto
Tela pode carregar parcialmente (tarefas ok, quadro inconsistente) sem aviso claro, dificultando diagnóstico.

### Recomendação
Tratar explicitamente `columnsRes` com toast/log e fallback seguro (`state.columns` default).

---

## Checks executados
- `node --check *.js` para validação de sintaxe.
- varredura estática de IDs HTML vs `getElementById` em JS para detectar possíveis referências quebradas.
