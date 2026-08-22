import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { PRINT_A4 } from '@/lib/print-documents';

/**
 * Print / share the same HTML document templates on every platform.
 * Native: expo-print (+ share sheet when available).
 * Web: browser print dialog — do not fork templates.
 * https://docs.expo.dev/versions/v57.0.0/sdk/print/
 * https://docs.expo.dev/versions/v57.0.0/sdk/sharing/
 */
export async function shareHtmlAsPdf(html: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    await printHtmlInBrowser(html, dialogTitle);
    return;
  }

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

function printHtmlInBrowser(html: string, dialogTitle: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      reject(new Error('Browser print is unavailable in this environment.'));
      return;
    }

    const frame = document.createElement('iframe');
    frame.setAttribute('title', dialogTitle);
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    const doc = frame.contentDocument ?? win?.document;
    if (!win || !doc) {
      frame.remove();
      reject(new Error('Could not open a print frame.'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      frame.remove();
      resolve();
    };

    win.focus();
    window.setTimeout(() => {
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.print();
        window.setTimeout(cleanup, 1000);
      } catch (error) {
        frame.remove();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, 50);
  });
}
