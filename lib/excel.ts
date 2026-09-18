import type { Commit } from '@/types/github';
import { formatDateDDMMYYYY } from '@/types/formatting';

export interface DailySummaryRow {
  date: string;
  repo: string;
  task: string;
}

/**
 * Escapes XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

/**
 * Exports commits to Excel spreadsheet (.xls / SpreadsheetML)
 * Columns: Tanggal, Repo, Task (Bahasa Indonesia)
 */
export function exportCommitsToExcel(
  commits: Commit[],
  translations: Record<string, string> = {},
  filename = 'github-commit-activity.xls'
): boolean {
  if (!commits || commits.length === 0) {
    return false;
  }

  const rows: DailySummaryRow[] = commits.map((c) => ({
    date: formatDateDDMMYYYY(c.date),
    repo: c.repository,
    task: translations[c.sha || c.id] || c.message,
  }));

  return exportDailySummariesToExcel(rows, filename);
}


/**
 * Exports daily summarized tasks to Excel spreadsheet (.xls / SpreadsheetML)
 * Columns: Tanggal, Repo, Task (Bahasa Indonesia)
 */
export function exportDailySummariesToExcel(
  summaries: DailySummaryRow[],
  filename = 'ringkasan-harian-github.xls'
): boolean {
  if (!summaries || summaries.length === 0) {
    return false;
  }

  const headers = ['Tanggal', 'Repo', 'Task'];
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1F2937" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Row">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Ringkasan Harian">
  <Table>
   <Column ss:Width="100"/>
   <Column ss:Width="240"/>
   <Column ss:Width="500"/>
   <Row ss:StyleID="Header" ss:Height="24">
    ${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}
   </Row>
   ${summaries
     .map(
       (r) =>
         `<Row ss:StyleID="Row" ss:Height="24">
      <Cell><Data ss:Type="String">${escapeXml(r.date)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.repo)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.task)}</Data></Cell>
    </Row>`
     )
     .join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
}
