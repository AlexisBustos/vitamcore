import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadFile, toQuery } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';

/**
 * Botón que descarga un Excel del endpoint dado con los filtros actuales.
 * Reutilizable en las pestañas de Finanzas (ingresos/gastos/bancos/reporte).
 */
export function ExportExcelButton({
  endpoint,
  params = {},
  label = 'Exportar a Excel',
  variant = 'outline',
}: {
  endpoint: string;
  params?: Record<string, string | undefined | null>;
  label?: string;
  variant?: 'outline' | 'ghost' | 'primary';
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await downloadFile(`${endpoint}${toQuery(params)}`);
    } catch (err) {
      alert(`No se pudo exportar: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant={variant} onClick={handleClick} disabled={loading}>
      <FileDown className="h-4 w-4" />
      {loading ? 'Generando…' : label}
    </Button>
  );
}
