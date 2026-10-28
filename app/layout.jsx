import './globals.css';

export const metadata = {
  title: 'BookMyShow Karwar Tracker | Ramayana Tickets Live Monitor',
  description: 'Real-time ticket availability tracker and Discord webhook alert system for BookMyShow Karwar',
  icons: {
    icon: 'https://assets-in.bmscdn.com/webin/common/favicon.ico',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-bms-red selection:text-white">
        {children}
      </body>
    </html>
  );
}

