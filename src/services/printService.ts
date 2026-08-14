import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { PRINT_A4 } from '@/lib/print-documents';

export async function shareHtmlAsPdf(html: string, dialogTitle: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({
    html,
    width: PRINT_A4.width,
    height: PRINT_A4.height,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle,
    });
    return;
  }

  await Print.printAsync({
    html,
    width: PRINT_A4.width,
    height: PRINT_A4.height,
  });
}
