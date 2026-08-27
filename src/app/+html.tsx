/**
 * Root HTML for Expo static web. Viewport-fit covers the iOS home indicator
 * so shop screens stay inside the visible phone chrome.
 * https://docs.expo.dev/router/web/static-rendering/
 * https://docs.expo.dev/versions/v57.0.0/config/app/#favicon
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>GIRVI SEWA</title>
        <meta
          name="description"
          content="Record-keeping software for a pawn-broking shop — shop ledger and customer receipt viewer."
        />
        <meta name="theme-color" content="#4E0F1A" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
