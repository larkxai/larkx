import { Inter } from "next/font/google"
import "./globals.css"
import { MainSidebar } from "@/components/main-sidebar"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "Hiredot",
  description: "Streamline your hiring process",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          <MainSidebar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  )
}
