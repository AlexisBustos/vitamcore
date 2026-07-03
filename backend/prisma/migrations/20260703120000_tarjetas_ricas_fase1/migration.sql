-- Fase 1: tarjetas ricas — fecha de inicio + etiquetas (aditivo, sin pérdida de datos)

-- Columna fecha de inicio en tareas
ALTER TABLE "tasks" ADD COLUMN "startDate" TIMESTAMP(3);

-- Etiquetas por empresa
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "labels_organizationId_name_key" ON "labels"("organizationId", "name");
CREATE INDEX "labels_organizationId_idx" ON "labels"("organizationId");

ALTER TABLE "labels" ADD CONSTRAINT "labels_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Puente Task ↔ Label
CREATE TABLE "task_labels" (
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("taskId", "labelId")
);

CREATE INDEX "task_labels_labelId_idx" ON "task_labels"("labelId");

ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
