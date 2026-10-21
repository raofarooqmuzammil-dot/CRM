import './globals.css';

export const metadata = { title: 'Call CRM' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
