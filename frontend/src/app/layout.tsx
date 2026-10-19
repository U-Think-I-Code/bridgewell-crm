import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import AuthWrapper from '@/components/AuthWrapper'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bridgewell CRM',
  description: 'In-House CRM for Student Admissions',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} h-screen bg-[#FDFDFD] text-gray-900 overflow-hidden selection:bg-gray-200`}>
        <AuthWrapper>
          <div className="flex h-screen w-full relative z-10">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {children}
            </div>
          </div>
        </AuthWrapper>
      </body>
    </html>
  )
}
