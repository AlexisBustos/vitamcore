# Mis tareas al iniciar sesión — Plan de implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada usuario vea sus tareas asignadas al iniciar sesión: tarjeta "Mis tareas" en el dashboard (CEO/ADMIN) y aterrizaje en `/tareas` filtrado para COLABORADOR.

**Architecture:** Solo frontend. Reutiliza `GET /tasks?assigneeId=<yo>` (accesible por todos los roles, ya devuelve empresa/proyecto/estado/prioridad/vencimiento) vía el hook existente `useTasks`. Sin cambios de backend, schema ni migraciones.

**Tech Stack:** React 19 + Vite + TanStack Query. Verificación: `npm run lint` (tsc --noEmit) + `npm run build` desde `frontend/`. No hay framework de tests en frontend.

**Spec:** `docs/superpowers/specs/2026-07-15-mis-tareas-inicio-design.md`.

**Convenciones:** español; componentes `Card`/`CardHeader`/`CardTitle`/`CardContent`, `PriorityBadge`, `EmptyState` ya existentes; tokens `var(--color-...)`; alias `@/`.

---

## Chunk 1: Frontend — aterrizaje del colaborador y tarjeta del dashboard

### Task 1: Colaborador aterriza en `/tareas` con "Mis tareas" activo

**Files:**
- Modify: `frontend/src/lib/permissions.ts` (`landingPath`)
- Modify: `frontend/src/pages/tasks/TasksPage.tsx` (estado inicial de `filters`)

- [ ] **Step 1: Cambiar `landingPath` a `/tareas` para no-admin**

En `frontend/src/lib/permissions.ts`, la función `landingPath`:

```ts
/** Ruta de aterrizaje según rol (admin → dashboard; colaborador → sus tareas). */
export function landingPath(role?: string): string {
  return isAdmin(role) ? '/' : '/tareas';
}
```

(Único consumidor: `RequireAdmin.tsx`, que reenvía al no-admin. `LoginPage` navega a `/` y desde ahí `RequireAdmin` lo reenvía a `/tareas`. No hay que tocar `LoginPage`.)

- [ ] **Step 2: Filtro "Mis tareas" por defecto para colaboradores en `TasksPage`**

En `frontend/src/pages/tasks/TasksPage.tsx`:

1. Importar `isAdmin` de permissions (junto a los imports existentes):

```tsx
import { isAdmin } from '@/lib/permissions';
```

2. Mover `const { user } = useAuth();` ARRIBA de la declaración de `filters` (hoy `useAuth()` se llama en la línea ~37, después del `useState` de `filters` en la ~28). El orden de hooks debe quedar: primero `useAuth()`, luego el `useState` de `filters`.

3. Inicializar `filters` con un inicializador perezoso que active "Mis tareas" solo para no-admins:

```tsx
  const { user } = useAuth();
  const [filters, setFilters] = useState<TaskFilters>(() =>
    !isAdmin(user?.role) && user?.id ? { assigneeId: user.id } : {},
  );
```

(`user` está garantizado por `ProtectedRoute` cuando `TasksPage` monta, así que el inicializador ve el `user` real. El admin arranca sin filtro, como hoy. El botón "Mis tareas" existente queda resaltado porque su estado depende de `filters.assigneeId`.)

- [ ] **Step 3: Typecheck y build**

```bash
cd frontend && npm run lint && npm run build
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/permissions.ts src/pages/tasks/TasksPage.tsx
git commit -m "feat(front): el colaborador aterriza en /tareas con Mis tareas activo"
```

---

### Task 2: Tarjeta "Mis tareas" en el dashboard (CEO/ADMIN)

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Añadir imports necesarios**

En `frontend/src/pages/DashboardPage.tsx`:
- Añadir `ListChecks` (o `CheckSquare`, que ya se importa) al bloque de `lucide-react` para el icono de la tarjeta. `CheckSquare` YA está importado — reutilizarlo.
- Añadir `isOverdue` al import de `@/lib/domain` (junto a `formatDate`, etc.).
- Importar el hook de tareas y auth:

```tsx
import { useTasks } from '@/hooks/useTasks';
import { useAuth } from '@/context/AuthContext';
```

- [ ] **Step 2: Consultar y preparar "mis tareas" dentro del componente**

Dentro de `DashboardPage`, tras `const { user } = useAuth();` (añadir esta línea) y las queries existentes, calcular la lista:

```tsx
  const { user } = useAuth();
  const { data: myTasksRaw } = useTasks(
    user?.id ? { assigneeId: user.id } : {},
  );
  const myTasks = useMemo(() => {
    if (!user?.id) return [];
    return (myTasksRaw ?? [])
      .filter((t) => t.status !== 'DONE')
      .sort((a, b) => {
        // Sin fecha al final; el resto por vencimiento ascendente.
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return av - bv;
      })
      .slice(0, 8);
  }, [myTasksRaw, user?.id]);
```

(Nota: si `user?.id` es indefinido el filtro `{}` traería todas las tareas, pero el `useMemo` corta a `[]`; bajo `RequireAdmin` `user` siempre existe, así que es solo un guard defensivo.)

- [ ] **Step 3: Renderizar la tarjeta**

Añadir la tarjeta junto a "Próximos vencimientos" (buscar el comentario `{/* Próximos vencimientos */}` y colocar la nueva tarjeta antes o después, en el mismo contenedor de grid). Estructura, imitando la de "Próximos vencimientos":

```tsx
          {/* Mis tareas pendientes */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
              <CardTitle>Mis tareas</CardTitle>
            </CardHeader>
            <CardContent>
              {myTasks.length === 0 ? (
                <EmptyState title="No tienes tareas pendientes" />
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {myTasks.map((t) => (
                    <Link
                      key={t.id}
                      to={`/tareas?tarea=${t.id}`}
                      className="flex items-center justify-between py-2.5 hover:bg-[var(--color-muted)]/40"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--color-foreground)]">
                          {t.title}
                        </p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {t.organization?.name ?? '—'}
                          {t.project ? ` · ${t.project.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <PriorityBadge value={t.priority} />
                        <span
                          className={
                            isOverdue(t.dueDate)
                              ? 'text-sm text-[var(--color-danger)]'
                              : 'text-sm text-[var(--color-muted-foreground)]'
                          }
                        >
                          {formatDate(t.dueDate)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <div className="pt-3">
                <Link
                  to="/tareas"
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Ver todas
                </Link>
              </div>
            </CardContent>
          </Card>
```

Notas de correctitud:
- `Link` ya está importado en `DashboardPage` (de `react-router-dom`).
- `isOverdue` acepta `string | null` (firma en `lib/domain.ts`); `formatDate` también. Verificar la firma real antes de usar y ajustar si difiere.
- `t.organization` es opcional en el tipo `Task` (`organization?: Ref`); por eso el `?? '—'`. La lista de `/tasks` sí lo incluye, así que en la práctica llega.
- Reutiliza `useMemo` (ya importado) para el cálculo.

- [ ] **Step 4: Typecheck y build**

```bash
cd frontend && npm run lint && npm run build
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(front): tarjeta Mis tareas en el dashboard"
```

---

### Task 3: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Typecheck + build completos**

```bash
cd frontend && npm run lint && npm run build
```

Expected: todo verde.

- [ ] **Step 2: Prueba manual (con backend + frontend en dev)**

1. Login como CEO (`ceo@vitam.tech`): el dashboard muestra la tarjeta "Mis tareas" con las tareas asignadas y sin terminar (o el estado vacío si no hay). "Ver todas" lleva a `/tareas`; clic en una fila abre el panel de esa tarea (`?tarea=<id>`).
2. Login como un COLABORADOR (crear uno en `/usuarios` si no existe, y asignarle alguna tarea): al entrar aterriza en `/tareas` con "Mis tareas" resaltado, mostrando solo sus tareas; puede desactivar el filtro para ver el resto de tareas visibles.

Expected: ambos flujos se cumplen.

- [ ] **Step 3: Cierre**

Usar la skill superpowers:finishing-a-development-branch para decidir merge/PR/deploy.
