import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = { title: "eduCBT | Learn. Practice. Excel.", description: "A focused learning and computer-based testing portal." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><head><script dangerouslySetInnerHTML={{__html:"window.MathJax={tex:{inlineMath:[['\\\\(','\\\\)'],['$','$']],displayMath:[['\\\\[','\\\\]']],packages:{'[+]':['ams']}},options:{ignoreHtmlClass:'no-mathjax',processHtmlClass:'mathjax'}};"}}/><script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"/></head><body>{children}</body></html>;
}
