import { redirect } from 'next/navigation'

export default function NewProjectCompatibilityPage() {
    redirect('/apps?project=new')
}
