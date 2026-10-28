import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOÊSIS · Physics and Maths roadmap",
  description: "Interactive Physics and Mathematics for CBSE/NCERT Class 11–12.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#050505" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-motion="system">
      <head>
        {/* apply the student's motion choice before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem("noesis:motion");if(m==="reduced"||m==="full")document.documentElement.dataset.motion=m}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
