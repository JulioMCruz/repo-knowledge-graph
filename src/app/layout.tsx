import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Repo Map",
  description: "Interactive 3D visualization of GitHub repositories",
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
