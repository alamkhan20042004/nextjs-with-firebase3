import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect the root to the User page
  redirect('/user')
}
