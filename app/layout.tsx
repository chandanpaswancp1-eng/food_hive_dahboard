import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
});

export const metadata: Metadata = {
  title: "Foodhive — Operations Dashboard",
  description: "Multi-brand cloud-kitchen operations & sales dashboard.",
};

// Runs before first paint/hydration to set the theme attribute without a
// flash of the wrong theme. Kept inline (not a module) since it must block
// rendering — an external/deferred script would run too late.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('foodhive-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
