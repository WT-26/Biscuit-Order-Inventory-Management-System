'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import Link from 'next/link'
import {Cookie,LockKeyhole,ShoppingBag} from 'lucide-react'
import {getSupabase} from '@/lib/supabase'

export default function WelcomePage(){
 const router=useRouter()
 const [mode,setMode]=useState<'choose'|'admin'>('choose')
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [busy,setBusy]=useState(false)
 const [checking,setChecking]=useState(true)
 const [error,setError]=useState('')
 useEffect(()=>{
   const client=getSupabase()
   if(!client){setChecking(false);return}
   let active=true
   client.auth.getUser().then(async({data})=>{
     if(!active)return
     if(data.user){
       const {data:admin,error:roleError}=await client.rpc('is_bakery_admin')
       if(active&&admin===true&&!roleError){router.replace('/admin');return}
     }
     if(active)setChecking(false)
   }).catch(()=>{if(active)setChecking(false)})
   return()=>{active=false}
 },[router])
 async function signIn(e:React.FormEvent<HTMLFormElement>){
   e.preventDefault()
   const client=getSupabase()
   if(!client){setError('Authentication is not configured.');return}
   setBusy(true);setError('')
   try{
     const {error:signInError}=await client.auth.signInWithPassword({email:email.trim(),password})
     if(signInError){setError('Invalid email or password.');return}
     const {data:isAdmin,error:roleError}=await client.rpc('is_bakery_admin')
     if(roleError||isAdmin!==true){
       await client.auth.signOut()
       setError('Email and password verified, but this user has not been assigned the Admin role in Supabase. Ask the database owner to enroll this account in bakery_admins.')
       return
     }
     router.replace('/admin')
   }catch{setError('Unable to sign in. Please try again.')}
   finally{setBusy(false)}
 }
 return <main className="flex min-h-screen items-center justify-center bg-[#f8f5f0] px-4 py-10 text-[#302923]">
  <div className="w-full max-w-lg rounded-2xl border border-[#e7dcd2] bg-white p-6 shadow-sm sm:p-9">
   <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-[#8e5e42] p-3 text-white"><Cookie className="size-7"/></span><div><h1 className="font-serif text-3xl font-bold">Tan Bakery</h1><p className="text-sm text-[#64574d]">Welcome to BiscuitFlow</p></div></div>
   {mode==='choose' ? <div className="space-y-4">
    <p className="text-sm text-[#64574d]">How would you like to continue?</p>
    <Link href="/order" className="flex items-center justify-center gap-2 rounded-xl bg-[#8e5e42] px-5 py-4 text-center font-semibold text-white"><ShoppingBag className="size-5"/> Login as Customer · Skip login</Link>
    <button type="button" onClick={()=>{setError('');setMode('admin')}} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#8e5e42] px-5 py-4 font-semibold text-[#7a4f37]"><LockKeyhole className="size-5"/> Login as Admin</button>
    <p className="text-center text-xs text-[#76685c]">Customers can browse and order without an account.</p>
   </div> : <section>
    <button type="button" onClick={()=>{setMode('choose');setError('');setPassword('')}} className="mb-5 text-sm font-semibold text-[#7a4f37] underline">← Back to login choices</button>
    <div className="mb-3 flex items-center gap-2"><LockKeyhole className="size-5 text-[#8e5e42]"/><h2 className="font-semibold">Admin sign in</h2></div>
    <form onSubmit={signIn} className="space-y-4">
     <label className="block text-sm font-medium text-[#45372e]">Admin email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com" className="mt-1 block w-full rounded-lg border border-[#c8b8a9] bg-white p-3 text-base text-[#302923] placeholder:text-[#817369]"/></label>
     <label className="block text-sm font-medium text-[#45372e]">Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" className="mt-1 block w-full rounded-lg border border-[#c8b8a9] bg-white p-3 text-base text-[#302923] placeholder:text-[#817369]"/></label>
     {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
     <button disabled={busy||checking} type="submit" className="w-full rounded-lg border border-[#8e5e42] px-4 py-3 text-sm font-bold text-[#7a4f37] disabled:opacity-50">{busy?'Signing in...':checking?'Checking session...':'Sign in to admin dashboard'}</button>
    </form>
   </section>
  </div>
 </main>
}
