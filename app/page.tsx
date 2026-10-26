'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { LanguageProvider, useLanguage } from '@/components/language-provider'
import { calculateRequirements, formatQuantity, suggestedIngredients, sampleRecipes, sampleStock, type Recipe, type StockItem, type Unit, type OrderItem } from '@/lib/biscuit-data'
import {
  AlertTriangle, Bell, CalendarDays, Check, ChevronDown, ClipboardList, Clock3,
  Cookie, Factory, FileText, Home, Inbox, Layers3, Menu, Package, Plus, Search,
  Settings, ShoppingCart, SlidersHorizontal, Sparkles, TrendingUp, X,
} from 'lucide-react'

type Status = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled'
type Order = { id: string; customer: string; items: string; qty: string; date: string; status: Status; method: string; shortage?: boolean; orderItems?: OrderItem[] }

type Ingredient = { name: string; stock: string; min: string; unit: string; status: 'Good' | 'Low' | 'Out' }

const initialOrders: Order[] = [
  { id: 'ORD-1048', customer: 'Alicia Wong', items: 'Peanut Biscuit, Butter Cookies', qty: '250 pcs', date: 'Oct 28, 2026', status: 'In Progress', method: 'Delivery', orderItems: [{ recipeId: 'peanut-recipe', pieces: 150 }, { recipeId: 'butter-recipe', pieces: 100 }] },
  { id: 'ORD-1047', customer: 'Benjamin Lee', items: 'Almond Biscuit', qty: '4 boxes', date: 'Oct 29, 2026', status: 'Pending', method: 'Pickup', shortage: true, orderItems: [{ recipeId: 'almond-recipe', pieces: 240 }] },
  { id: 'ORD-1046', customer: 'Cindy Tan', items: 'Chocolate Chip', qty: '180 pcs', date: 'Oct 30, 2026', status: 'Pending', method: 'Delivery', orderItems: [{ recipeId: 'chocolate-recipe', pieces: 180 }] },
  { id: 'ORD-1045', customer: 'Daniel Lim', items: 'Peanut Biscuit', qty: '100 pcs', date: 'Nov 02, 2026', status: 'Pending', method: 'Pickup', orderItems: [{ recipeId: 'peanut-recipe', pieces: 100 }] },
  { id: 'ORD-1044', customer: 'Emilia Goh', items: 'Butter Cookies', qty: '3 boxes', date: 'Nov 04, 2026', status: 'Completed', method: 'Delivery' },
]
const ingredients: Ingredient[] = [
  { name: 'Peanut', stock: '800 g', min: '500 g', unit: 'g', status: 'Good' },
  { name: 'Flour', stock: '5.0 kg', min: '1.0 kg', unit: 'kg', status: 'Good' },
  { name: 'Butter', stock: '420 g', min: '500 g', unit: 'g', status: 'Low' },
  { name: 'Almond', stock: '0 g', min: '300 g', unit: 'g', status: 'Out' },
]
const nav = [
  { label: 'Dashboard', icon: Home }, { label: 'Customer Orders', icon: ClipboardList }, { label: 'Biscuit Recipes', icon: Cookie },
  { label: 'Ingredient Inventory', icon: Package }, { label: 'Ingredient Calculator', icon: SlidersHorizontal }, { label: 'Shopping List', icon: ShoppingCart },
  { label: 'Production Planning', icon: Factory }, { label: 'Order Calendar', icon: CalendarDays }, { label: 'Notifications', icon: Bell }, { label: 'Settings', icon: Settings },
]

function StatusPill({ status }: { status: string }) { const {tr}=useLanguage()
  const styles: Record<string, string> = { Pending: 'bg-[#fff4df] text-[#a36514]', 'In Progress': 'bg-[#e9f0ff] text-[#4568a9]', Completed: 'bg-[#e5f5ed] text-[#287a51]', Cancelled: 'bg-[#f7e8e6] text-[#a34d44]', Good: 'bg-[#e5f5ed] text-[#287a51]', Low: 'bg-[#fff4df] text-[#a36514]', Out: 'bg-[#f7e8e6] text-[#a34d44]' }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status] || 'bg-[#f2eee9] text-[#746c65]'}`}>{tr(status)}</span>
}

export default function Page() { return <LanguageProvider><BiscuitFlowPage /></LanguageProvider> }
function BiscuitFlowPage() {
  const { language, setLanguage, tr } = useLanguage()
  const [active, setActive] = useState('Dashboard')
  const [orders, setOrders] = useState<Order[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [stock, setStock] = useState<StockItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [user,setUser] = useState<User|null>(null)
  const [authChecked,setAuthChecked] = useState(false)
  const [cloudError,setCloudError] = useState('')
  const [busy,setBusy] = useState(false)
  const previous = useRef({orders:new Map<string,string>(),recipes:new Map<string,string>(),stock:new Map<string,string>()})
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const client = getSupabase()
  useEffect(() => {
    if (!client) { setAuthChecked(true);return }
    let live = true
    client.auth.getUser().then(({data,error})=>{if(!live)return;if(error)setCloudError(error.message);setUser(data.user);setAuthChecked(true)})
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(live)setUser(session?.user??null)})
    return ()=>{live=false;subscription.unsubscribe()}
  },[client])
  useEffect(()=>{
    if(!client||!user){setHydrated(false);return}
    let live=true
    setHydrated(false)
    setCloudError('')
    Promise.all([
      client.from('biscuit_orders').select('*'),
      client.from('biscuit_recipes').select('*'),
      client.from('biscuit_stock').select('*'),
    ]).then(([o,r,i])=>{
      const error=o.error||r.error||i.error
      if(!live)return
      if(error){setCloudError(error.message);return}
      const loadedOrders:Order[]=(o.data??[]).map(x=>({id:x.id,customer:x.customer,items:x.items,qty:x.qty,date:x.date,status:x.status as Status,method:x.method,shortage:x.shortage,orderItems:x.order_items??[]}))
      const loadedRecipes:Recipe[]=(r.data??[]).map(x=>({id:x.id,name:x.name,yieldPieces:Number(x.yield_pieces),ingredients:x.ingredients??[]}))
      const loadedStock:StockItem[]=(i.data??[]).map(x=>({id:x.id,name:x.name,quantity:Number(x.quantity),minimum:Number(x.minimum),unit:x.unit as Unit}))
      previous.current={
        orders:new Map(loadedOrders.map(x=>[x.id,JSON.stringify(x)])),
        recipes:new Map(loadedRecipes.map(x=>[x.id,JSON.stringify(x)])),
        stock:new Map(loadedStock.map(x=>[x.id,JSON.stringify(x)]))
      }
      setOrders(loadedOrders);setRecipes(loadedRecipes);setStock(loadedStock);setHydrated(true)
    }).catch(e=>{if(live)setCloudError(String(e))})
    return ()=>{live=false}
  },[client,user?.id])
  useEffect(()=>{
    if(!hydrated||!client||!user)return
    const changed=orders.filter(x=>previous.current.orders.get(x.id)!==JSON.stringify(x))
    if(!changed.length)return
    const rows=changed.map(x=>({owner_id:user.id,id:x.id,customer:x.customer,items:x.items,qty:x.qty,date:x.date,status:x.status,method:x.method,shortage:x.shortage??false,order_items:x.orderItems??[]}))
    client.from('biscuit_orders').upsert(rows,{onConflict:'owner_id,id'}).then(({error})=>{
      if(error)setCloudError('Order save failed: '+error.message)
      else changed.forEach(x=>previous.current.orders.set(x.id,JSON.stringify(x)))
    })
  },[orders,hydrated,client,user])
  useEffect(()=>{
    if(!hydrated||!client||!user)return
    const changed=recipes.filter(x=>previous.current.recipes.get(x.id)!==JSON.stringify(x))
    if(!changed.length)return
    const rows=changed.map(x=>({owner_id:user.id,id:x.id,name:x.name,yield_pieces:x.yieldPieces,ingredients:x.ingredients}))
    client.from('biscuit_recipes').upsert(rows,{onConflict:'owner_id,id'}).then(({error})=>{
      if(error)setCloudError('Recipe save failed: '+error.message)
      else changed.forEach(x=>previous.current.recipes.set(x.id,JSON.stringify(x)))
    })
  },[recipes,hydrated,client,user])
  useEffect(()=>{
    if(!hydrated||!client||!user)return
    const changed=stock.filter(x=>previous.current.stock.get(x.id)!==JSON.stringify(x))
    if(!changed.length)return
    const rows=changed.map(x=>({owner_id:user.id,id:x.id,name:x.name,quantity:x.quantity,minimum:x.minimum,unit:x.unit}))
    client.from('biscuit_stock').upsert(rows,{onConflict:'owner_id,id'}).then(({error})=>{
      if(error)setCloudError('Stock save failed: '+error.message)
      else changed.forEach(x=>previous.current.stock.set(x.id,JSON.stringify(x)))
    })
  },[stock,hydrated,client,user])
  async function signIn(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(!client)return
    setBusy(true);setCloudError('')
    const data=new FormData(e.currentTarget)
    const {error}=await client.auth.signInWithPassword({email:String(data.get('email')),password:String(data.get('password'))})
    if(error)setCloudError(error.message)
    setBusy(false)
  }
  const requirements = useMemo(() => calculateRequirements(orders.map(o => ({ id: o.id, status: o.status, items: o.orderItems ?? [] })), recipes, stock), [orders, recipes, stock])
  const shortages = requirements.filter(r => r.shortage > 0)
  const urgentOrders = orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled' && new Date(o.date).getTime() < Date.now() + 3 * 86400000)

  const filtered = useMemo(() => orders.filter((o) => `${o.customer} ${o.id} ${o.items}`.toLowerCase().includes(search.toLowerCase())), [orders, search])
  const counts = { total: orders.length, pending: orders.filter(o => o.status === 'Pending').length, progress: orders.filter(o => o.status === 'In Progress').length, completed: orders.filter(o => o.status === 'Completed').length }

  function addOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); const customer = String(data.get('customer') || 'New customer')
    const items = data.getAll('item').map(String)
    if (items.length === 0) { window.alert('Select at least one biscuit.'); return }
    const orderItems = items.map(item => ({ recipeId: recipes.find(r => r.name === item)?.id ?? '', pieces: Number(data.get(`quantity-${item}`) || 1) }))
    const quantities = items.map((item) => `${item}: ${data.get(`quantity-${item}`) || 1} pcs`)
    const dueDate = String(data.get('dueDate') || '')
    const formattedDueDate = dueDate ? new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Nov 06, 2026'
    setOrders([{ id: crypto.randomUUID(), customer, items: items.join(', ') || 'Peanut Biscuit', qty: quantities.join(' · ') || 'Peanut Biscuit: 1 pcs', date: formattedDueDate, status: 'Pending', method: 'Pickup', orderItems }, ...orders]); setShowAdd(false)
  }

  if (!client) return <div className="mx-auto mt-24 max-w-md rounded-xl border p-8"><h1 className="text-2xl font-bold">Supabase setup required</h1><p className="mt-3">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the development server.</p></div>
  if (!authChecked) return <div className="p-10">Checking login...</div>
  if (!user) return <div className="flex min-h-screen items-center justify-center bg-[#f8f5f0] p-4"><form onSubmit={signIn} className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-sm"><h1 className="font-serif text-2xl font-bold">BiscuitFlow</h1><p className="mt-2 text-sm text-gray-600">Private admin login / 管理员登录</p><label className="mt-5 block text-sm">Email<input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border p-2"/></label><label className="mt-4 block text-sm">Password / 密码<input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-lg border p-2"/></label>{cloudError&&<p role="alert" className="mt-3 text-sm text-red-700">{cloudError}</p>}<button disabled={busy} className="mt-5 w-full rounded-lg bg-[#8e5e42] p-3 font-semibold text-white">{busy?'Signing in...':'Sign in / 登录'}</button></form></div>
  if (!hydrated) return <div className="p-10">{cloudError?<div role="alert" className="text-red-700">{cloudError}<button className="ml-4 underline" onClick={()=>location.reload()}>Retry</button></div>:'Loading your cloud data / 正在读取云端资料...'}</div>
  return <div className="min-h-screen bg-[#f8f5f0] text-[#302923]">
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-[250px] flex-col border-r border-[#ebe4dc] bg-[#fffdf9] px-4 py-5 transition-transform lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-3 px-3"><div className="flex size-10 items-center justify-center rounded-xl bg-[#8e5e42] text-white shadow-sm"><Cookie /></div><div><div className="font-serif text-lg font-bold tracking-tight">BiscuitFlow</div><div className="text-[10px] font-medium uppercase tracking-[.16em] text-[#a58e7b]">{tr('Bakery operations')}</div></div></div>
      <div className="mt-9 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#b6a99d]">{tr('Workspace')}</div>
      <nav className="mt-3 flex flex-1 flex-col gap-1">{nav.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActive(label); setMenuOpen(false) }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${active === label ? 'bg-[#f2e8df] text-[#7d4d34]' : 'text-[#81766d] hover:bg-[#f8f2eb] hover:text-[#54473e]'}`}><Icon className="size-[17px]" />{tr(label)}{label === 'Notifications' && (shortages.length + urgentOrders.length > 0) && <span className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-[#bd6b48] px-1 text-[10px] font-bold text-white">{shortages.length + urgentOrders.length}</span>}</button>)}</nav>
      <div className="rounded-2xl bg-[#f5eee7] p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-[#7d4d34]"><Sparkles className="size-4" /> {tr('Good morning, Maya')}</div><p className="mt-2 text-[11px] leading-relaxed text-[#9a887b]">{tr('You have 3 orders to prepare this week.')}</p></div>
      <div className="mt-4 flex items-center gap-3 border-t border-[#eee7df] pt-4"><div className="flex size-9 items-center justify-center rounded-full bg-[#d7b29a] text-sm font-bold text-white">MS</div><div className="min-w-0"><div className="truncate text-xs font-semibold">Maya S.</div><div className="text-[10px] text-[#a58e7b]">Administrator</div></div><ChevronDown className="ml-auto size-4 text-[#a58e7b]" /></div>
    </aside>
    {menuOpen && <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 bg-black/20 lg:hidden" />}
    <main className="lg:ml-[250px]">
      <header className="sticky top-0 z-10 flex h-[74px] items-center justify-between border-b border-[#ebe4dc] bg-[#f8f5f0]/90 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 hover:bg-white lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button><div className="hidden text-sm text-[#a08e80] sm:block">Tuesday, October 27, 2026</div><div className="sm:hidden text-sm font-semibold">{tr(active)}</div></div><div className="flex items-center gap-3"><select aria-label="Language / 语言" value={language} onChange={e => setLanguage(e.target.value as 'en' | 'zh')} className="rounded-lg border border-[#e5dbd1] bg-white px-2 py-1.5 text-xs font-semibold"><option value="en">English</option><option value="zh">简体中文</option></select><div className="relative hidden md:block"><Search className="absolute left-3 top-2.5 size-4 text-[#b3a69b]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("Search orders, recipes...")} className="h-9 w-56 rounded-lg border border-[#e9e1d9] bg-white pl-9 pr-3 text-xs outline-none placeholder:text-[#b8ada3] focus:border-[#bd8b6d]" /></div><button type="button" aria-label={tr("Notifications")} title={tr("Notifications")} onClick={() => { setActive("Notifications"); setMenuOpen(false) }} className="relative rounded-lg p-2 text-[#88796d] hover:bg-white"><Bell className="size-[18px]" />{shortages.length + urgentOrders.length > 0 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[#bd6b48]" />}</button><div className="hidden h-7 w-px bg-[#e6ded5] sm:block" /><button className="rounded-lg border border-[#e5dbd1] px-2 py-1.5 text-xs" onClick={()=>client.auth.signOut()}>Sign out / 登出</button><div className="flex size-8 items-center justify-center rounded-full bg-[#d7b29a] text-[11px] font-bold text-white">MS</div></div></header>
      <div className="mx-auto max-w-[1400px] p-5 sm:p-8">{cloudError&&<div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{cloudError}</div>}
        {active === 'Dashboard' && (shortages.length > 0 || urgentOrders.length > 0) && <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mr-2 inline size-4" />{shortages.length} ingredient shortages · {urgentOrders.length} orders due soon or overdue. <button className="ml-2 font-semibold underline" onClick={() => setActive('Ingredient Calculator')}>Review requirements</button></div>}
        {active === 'Dashboard' && <Dashboard counts={counts} orders={orders} setActive={setActive} />}
        {active === 'Customer Orders' && <OrdersPage orders={filtered} setOrders={setOrders} onAdd={() => setShowAdd(true)} />}
        {active === 'Biscuit Recipes' && <RecipesPage recipes={recipes} setRecipes={setRecipes} stock={stock} />}
        {active === 'Ingredient Inventory' && <InventoryPage stock={stock} setStock={setStock} />}
        {active === 'Ingredient Calculator' && <CalculatorPage requirements={requirements} onShopping={() => setActive('Shopping List')} />}
        {active === 'Shopping List' && <ShoppingPage requirements={requirements} setStock={setStock} />}
        {active === 'Production Planning' && <PlanningPage />}
        {active === 'Order Calendar' && <CalendarPage orders={orders} />}
        {active === 'Notifications' && <NotificationsPage orders={orders} requirements={requirements} onNavigate={setActive} />}
        {active === 'Settings' && <SettingsPage />}
      </div>
    </main>
    {showAdd && <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#39291f]/30 p-4"><form onSubmit={addOrder} className="w-full max-w-md rounded-2xl bg-[#fffdf9] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-serif text-xl font-bold">{tr("Add new order")}</h2><p className="mt-1 text-xs text-[#a08e80]">{tr("Create a customer order for your bakery.")}</p></div><button type="button" onClick={() => setShowAdd(false)} aria-label="Close"><X className="size-5 text-[#9e8d80]" /></button></div><div className="flex flex-col gap-4"><label className="text-xs font-semibold">{tr("Customer name")}<input name="customer" required className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm outline-none focus:border-[#bd8b6d]" placeholder="e.g. Sarah Lim" /></label><fieldset className="flex flex-col gap-2"><legend className="text-xs font-semibold">{tr("Biscuit types and quantities")}<span className="ml-1 font-normal text-[#a08e80]">(select each type and set its quantity)</span></legend>{recipes.map((recipe) => recipe.name).map((item) => <label key={item} className="flex items-center gap-2 rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-xs"><input name="item" value={item} type="checkbox" className="accent-[#8e5e42]" /><span className="min-w-0 flex-1">{item}</span><input name={`quantity-${item}`} type="number" min="1" defaultValue="100" aria-label={`${item} quantity`} className="h-8 w-20 rounded-md border border-[#e5dbd1] px-2 text-right text-xs outline-none focus:border-[#bd8b6d]" /><span className="text-[#a08e80]">pcs</span></label>)}</fieldset><label className="text-xs font-semibold">{tr("Due date")}<input name="dueDate" type="date" required className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm outline-none focus:border-[#bd8b6d]" /></label><button className="mt-2 rounded-lg bg-[#8e5e42] py-2.5 text-sm font-semibold text-white hover:bg-[#744832]">{tr("Create order")}</button></div></form></div>}
  </div>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { const {tr}=useLanguage(); return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#b08368]">{tr(eyebrow)}</div><h1 className="font-serif text-3xl font-bold tracking-tight text-[#352a24]">{tr(title)}</h1><p className="mt-1.5 text-sm text-[#978a7f]">{tr(description)}</p></div>{action}</div> }
function Dashboard({ counts, orders, setActive }: { counts: Record<string, number>; orders: Order[]; setActive: (v: string) => void }) { const {tr}=useLanguage(); const statCards: Array<[string, number, React.ComponentType<{ className?: string }>, string, string]> = [['Total orders', counts.total, TrendingUp, '+12.5%', 'text-[#8e5e42]'], ['Pending orders', counts.pending, Clock3, '3 due this week', 'text-[#b17427]'], ['In progress', counts.progress, Factory, 'On schedule', 'text-[#5977a8]'], ['Completed', counts.completed, Check, 'This month', 'text-[#398361]']]; return <><PageHeading eyebrow="Tuesday, October 27" title="Good morning, Maya" description="Here’s what’s happening with your bakery today." action={<button onClick={() => setActive('Customer Orders')} className="flex items-center justify-center gap-2 rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#744832]"><Plus className="size-4" /> New order</button>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map(([label, value, Icon, note, color]) => <div key={String(label)} className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5 shadow-[0_2px_10px_rgba(100,70,45,.03)]"><div className="flex items-start justify-between"><div className="text-xs font-medium text-[#978a7f]">{label as string}</div><div className={`rounded-lg bg-[#f6efe8] p-2 ${color}`}><Icon className="size-4" /></div></div><div className="mt-4 flex items-end gap-2"><div className="font-serif text-3xl font-bold">{value as number}</div><div className="mb-1 text-[10px] font-semibold text-[#6b9a7d]">{note as string}</div></div></div>)}</div><div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]"><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-serif text-lg font-bold">Upcoming orders</h2><p className="mt-1 text-xs text-[#a29285]">Your next customer deadlines</p></div><button onClick={() => setActive('Customer Orders')} className="text-xs font-semibold text-[#9b674b] hover:underline">View all</button></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-[#eee7df] text-[10px] font-bold uppercase tracking-wider text-[#b2a49a]"><th className="pb-3">Customer</th><th className="pb-3">Order</th><th className="pb-3">{tr("Due date")}</th><th className="pb-3">{tr("Status")}</th></tr></thead><tbody>{orders.slice(0, 4).map(o => <tr key={o.id} className="border-b border-[#f2ece6] last:border-0"><td className="py-3.5"><div className="text-sm font-semibold">{o.customer}</div><div className="text-[10px] text-[#ae9f93]">{o.id}</div></td><td className="py-3.5 text-xs text-[#776c63]">{o.items}</td><td className="py-3.5 text-xs font-medium">{o.date}</td><td className="py-3.5"><StatusPill status={o.status} /></td></tr>)}</tbody></table></div></div><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="flex items-start justify-between"><div><h2 className="font-serif text-lg font-bold">Ingredient health</h2><p className="mt-1 text-xs text-[#a29285]">Current stock levels</p></div><Package className="size-5 text-[#b08368]" /></div><div className="mt-5 flex items-end gap-3"><div className="font-serif text-4xl font-bold">75%</div><div className="mb-1 text-xs text-[#6b9a7d]">Healthy stock</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f2ebe4]"><div className="h-full w-3/4 rounded-full bg-[#8eaa78]" /></div><div className="mt-5 flex flex-col gap-3">{ingredients.map(i => <div key={i.name} className="flex items-center justify-between"><div className="flex items-center gap-2.5"><span className={`size-2 rounded-full ${i.status === 'Good' ? 'bg-[#7fa56f]' : i.status === 'Low' ? 'bg-[#d49b43]' : 'bg-[#c46f61]'}`} /><span className="text-xs font-medium">{i.name}</span></div><div className="flex items-center gap-2"><span className="text-xs text-[#8d7f74]">{i.stock}</span><StatusPill status={i.status} /></div></div>)}</div></div></div><div className="mt-6 grid gap-6 md:grid-cols-2"><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="flex items-center justify-between"><div><h2 className="font-serif text-lg font-bold">Order activity</h2><p className="mt-1 text-xs text-[#a29285]">Orders over the last 7 days</p></div><span className="text-xs font-semibold text-[#6b9a7d]">+18.4%</span></div><div className="mt-6 flex h-32 items-end gap-3 px-2">{[42, 55, 38, 68, 58, 86, 74].map((height, i) => <div key={i} className="flex flex-1 flex-col items-center gap-2"><div className={`w-full rounded-t-md ${i === 5 ? 'bg-[#8e5e42]' : 'bg-[#dfc9b8]'}`} style={{ height: `${height}%` }} /><span className="text-[10px] text-[#b0a197]">{['M','T','W','T','F','S','S'][i]}</span></div>)}</div></div><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-[#fff2dd] p-2 text-[#bd762c]"><AlertTriangle className="size-4" /></div><div><h2 className="font-serif text-lg font-bold">Needs your attention</h2><p className="mt-1 text-xs text-[#a29285]">Resolve these before your next bake</p></div></div><div className="mt-5 flex flex-col gap-3"><div className="flex items-center justify-between rounded-xl bg-[#fff8ed] p-3"><div><div className="text-xs font-semibold">Almond stock is empty</div><div className="mt-1 text-[10px] text-[#aa927b]">Affects Benjamin Lee’s order</div></div><button onClick={() => setActive('Shopping List')} className="text-[11px] font-bold text-[#a36514]">Shop now</button></div><div className="flex items-center justify-between rounded-xl bg-[#f8f1eb] p-3"><div><div className="text-xs font-semibold">Butter is running low</div><div className="mt-1 text-[10px] text-[#aa927b]">Below minimum threshold</div></div><button onClick={() => setActive('Ingredient Inventory')} className="text-[11px] font-bold text-[#8e5e42]">Review</button></div></div></div></div></> }

function OrdersPage({ orders, setOrders, onAdd }: { orders: Order[]; setOrders: React.Dispatch<React.SetStateAction<Order[]>>; onAdd: () => void }) { const {tr}=useLanguage(); const [statusFilter,setStatusFilter]=useState<'All' | Status>('All'); const visibleOrders=orders.filter(o=>statusFilter==='All'||o.status===statusFilter); return <><PageHeading eyebrow="Workspace / Orders" title="Customer orders" description="Track every biscuit order from request to delivery." action={<button onClick={onAdd} className="flex items-center justify-center gap-2 rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="size-4" /> New order</button>} /><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2">{(['All','Pending','In Progress','Completed','Cancelled'] as const).map(status=><button key={status} type="button" aria-pressed={statusFilter===status} onClick={()=>setStatusFilter(status)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${statusFilter===status?'bg-[#f2e8df] text-[#7d4d34]':'text-[#95877c] hover:bg-[#f8f2eb]'}`}>{status==='All'?tr('All orders'):tr(status)}</button>)}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left"><thead><tr className="border-b border-[#eee7df] text-[10px] font-bold uppercase tracking-wider text-[#b2a49a]"><th className="pb-3">Customer</th><th className="pb-3">Biscuit items</th><th className="pb-3">{tr("Quantity")}</th><th className="pb-3">Delivery date</th><th className="pb-3">{tr("Status")}</th><th /></tr></thead><tbody>{visibleOrders.map(o => <tr key={o.id} className="border-b border-[#f2ece6] last:border-0"><td className="py-4"><div className="text-sm font-semibold">{o.customer}</div><div className="text-[10px] text-[#ae9f93]">{o.id} · {o.method}</div></td><td className="py-4 text-xs text-[#776c63]">{o.items}</td><td className="py-4 text-xs">{o.qty}</td><td className="py-4 text-xs font-medium">{o.date}</td><td className="py-4"><StatusPill status={o.status} />{o.shortage && <div className="mt-1 text-[10px] font-semibold text-[#bd6b48]">Ingredient shortage</div>}</td><td className="py-4 text-right"><select value={o.status} onChange={e => setOrders(prev => prev.map(item => item.id === o.id ? { ...item, status: e.target.value as Status } : item))} className="rounded-md border border-[#eee5dc] bg-transparent px-2 py-1 text-[11px] text-[#816e60]"><option value="Pending">{tr("Pending")}</option><option value="In Progress">{tr("In Progress")}</option><option value="Completed">{tr("Completed")}</option><option value="Cancelled">{tr("Cancelled")}</option></select></td></tr>)}{visibleOrders.length===0&&<tr><td colSpan={6} className="py-8 text-center text-sm text-[#95877c]">{tr("No orders found")}</td></tr>}</tbody></table></div></div></> }

function RecipesPage({ recipes, setRecipes, stock }: { recipes: Recipe[]; setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>; stock: StockItem[] }) { const {tr}=useLanguage();
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [yieldPieces, setYieldPieces] = useState(100)
  const [parts, setParts] = useState<Recipe['ingredients']>([])
  function openEditor(recipe?: Recipe) {
    setEditing(recipe ?? null); setName(recipe?.name ?? ''); setYieldPieces(recipe?.yieldPieces ?? 100)
    setParts(recipe?.ingredients.map(i => ({...i})) ?? []); setOpen(true)
  }
  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || yieldPieces <= 0 || parts.length === 0 || parts.some(p => !p.ingredientId || p.quantity <= 0) || new Set(parts.map(p => p.ingredientId)).size !== parts.length) {
      alert('Enter a name, positive yield and valid, unique ingredients.'); return
    }
    const record: Recipe = { id: editing?.id ?? crypto.randomUUID(), name: name.trim(), yieldPieces, ingredients: parts }
    setRecipes(old => editing ? old.map(r => r.id === editing.id ? record : r) : [...old, record])
    setOpen(false)
  }
  return <><PageHeading eyebrow="Workspace / Recipes" title="Biscuit recipes" description="Saved recipes are used in live order ingredient calculations." action={<button onClick={() => openEditor()} className="rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="mr-2 inline size-4"/>{tr("New recipe")}</button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{recipes.map(recipe => <div key={recipe.id} className="rounded-2xl border border-[#ebe3da] bg-white p-5"><Cookie className="mb-3 size-8 text-[#a87556]"/><h3 className="font-serif text-lg font-bold">{recipe.name}</h3><p className="mt-2 text-xs text-[#9b8b7f]">Yields {recipe.yieldPieces} pieces · {recipe.ingredients.length} ingredients</p><div className="mt-3 space-y-1 text-xs">{recipe.ingredients.map(i => <p key={i.ingredientId}>{stock.find(s => s.id === i.ingredientId)?.name ?? 'Unknown ingredient'}: {i.quantity} {i.unit}</p>)}</div><button onClick={() => openEditor(recipe)} className="mt-4 rounded-lg border px-3 py-2 text-xs font-semibold">{tr("Edit recipe")}</button></div>)}</div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6"><div className="flex items-center justify-between"><h2 className="font-serif text-xl font-bold">{editing ? 'Edit recipe' : 'New recipe'}</h2><button type="button" onClick={() => setOpen(false)}><X/></button></div><label className="mt-5 block text-sm">Biscuit name<input required value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/></label><label className="mt-3 block text-sm">Pieces per batch<input required type="number" min="1" value={yieldPieces} onChange={e => setYieldPieces(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/></label><h3 className="mt-5 font-semibold">Ingredients per batch</h3><div className="mt-3 space-y-3">{parts.map((part,i) => <div key={i} className="flex flex-wrap gap-2"><select aria-label="Ingredient" value={part.ingredientId} onChange={e => {const found=stock.find(s => s.id === e.target.value);setParts(old=>old.map((p,j)=>j===i?{...p,ingredientId:e.target.value,unit:found?.unit??'g'}:p))}} className="rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"><option value="">{tr("Select ingredient")}</option>{stock.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Quantity" type="number" min="0.001" step="any" value={part.quantity} onChange={e=>setParts(old=>old.map((p,j)=>j===i?{...p,quantity:Number(e.target.value)}:p))} className="w-24 rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><select aria-label="Unit" value={part.unit} onChange={e=>setParts(old=>old.map((p,j)=>j===i?{...p,unit:e.target.value as Unit}:p))} className="rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm">{(['g','kg','ml','L','pcs'] as Unit[]).map(u=><option key={u}>{u}</option>)}</select><button type="button" aria-label="Remove ingredient" onClick={()=>setParts(old=>old.filter((_,j)=>j!==i))}><X className="size-4"/></button></div>)}</div><button type="button" onClick={()=>setParts(old=>[...old,{ingredientId:'',quantity:1,unit:'g'}])} className="mt-4 rounded-lg border px-3 py-2 text-xs">+ Add ingredient</button><p className="mt-3 text-xs text-[#9b8b7f]">{tr("Add ingredients in Inventory first. Units must be compatible with their inventory units.")}</p><button type="submit" className="mt-5 block w-full rounded-lg bg-[#8e5e42] py-3 font-semibold text-white">{tr("Save recipe")}</button></form></div>}
  </>
}

function InventoryPage({ stock, setStock }: { stock: StockItem[]; setStock: React.Dispatch<React.SetStateAction<StockItem[]>> }) { const {tr}=useLanguage();
  const [name,setName]=useState(''); const [quantity,setQuantity]=useState(0); const [minimum,setMinimum]=useState(0); const [unit,setUnit]=useState<Unit>('g'); const [open,setOpen]=useState(false)
  function addCatalog() {
    const existing=new Set(stock.map(item=>item.name.trim().toLowerCase()))
    const additions=suggestedIngredients.filter(item=>!existing.has(item.name.toLowerCase()) && !(item.name==='Eggs' && existing.has('egg')))
    if(!additions.length){alert('All suggested ingredients already exist.');return}
    setStock(old=>[...old,...additions])
    alert(`Added ${additions.length} ingredients with 0 starting stock. Enter your actual quantities in Inventory.`)
  }
  function save(e:React.FormEvent) {e.preventDefault();if(!name.trim()||quantity<0||minimum<0||stock.some(s=>s.name.toLowerCase()===name.trim().toLowerCase())){alert('Enter a unique name and nonnegative amounts.');return}setStock(old=>[...old,{id:crypto.randomUUID(),name:name.trim(),quantity,minimum,unit}]);setOpen(false);setName('');setQuantity(0);setMinimum(0)}
  return <><PageHeading eyebrow="Workspace / Inventory" title="Ingredient inventory" description="Adjust stock here; requirements and shopping list update automatically." action={<div className="flex flex-wrap gap-2"><button onClick={addCatalog} className="rounded-lg border border-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-[#8e5e42]">Add suggested ingredients / 添加原材料清单</button><button onClick={()=>setOpen(true)} className="rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="mr-2 inline size-4"/>{tr("Add ingredient")}</button></div>}/><div className="overflow-x-auto rounded-2xl border bg-white p-5"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-xs"><th className="py-3">{tr("Ingredient")}</th><th>{tr("Stock")}</th><th>{tr("Minimum")}</th><th>{tr("Status")}</th><th>Update available quantity</th></tr></thead><tbody>{stock.map(item=><tr key={item.id} className="border-b last:border-0"><td className="py-3 font-semibold">{item.name}</td><td>{formatQuantity(item.quantity,item.unit)}</td><td>{formatQuantity(item.minimum,item.unit)}</td><td><StatusPill status={item.quantity===0?'Out':item.quantity<item.minimum?'Low':'Good'}/></td><td><input aria-label={`Stock for ${item.name}`} type="number" step="any" min="0" value={item.quantity} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0)setStock(old=>old.map(s=>s.id===item.id?{...s,quantity:value}:s))}} className="w-28 rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/></td></tr>)}</tbody></table></div>
  {open&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"><form onSubmit={save} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6"><h2 className="font-serif text-xl font-bold">{tr("Add ingredient")}</h2><input required placeholder="Ingredient name" value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><input type="number" min="0" step="any" placeholder="Available stock" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><input type="number" min="0" step="any" placeholder="Minimum stock" value={minimum} onChange={e=>setMinimum(Number(e.target.value))} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><select value={unit} onChange={e=>setUnit(e.target.value as Unit)} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm">{(['g','kg','ml','L','pcs'] as Unit[]).map(u=><option key={u}>{u}</option>)}</select><div className="flex justify-end gap-3"><button type="button" onClick={()=>setOpen(false)}>{tr("Cancel")}</button><button className="rounded-lg bg-[#8e5e42] px-4 py-2 text-white">{tr("Save")}</button></div></form></div>}
  </>
}

function CalculatorPage({ requirements,onShopping }: { requirements: ReturnType<typeof calculateRequirements>; onShopping:()=>void }) { const {tr}=useLanguage();
  const used=requirements.filter(r=>r.required>0),missing=used.filter(r=>r.shortage>0)
  return <><PageHeading eyebrow="Workspace / Planning" title="Ingredient calculator" description="Calculated from saved recipes and all pending or in-progress orders." action={<button onClick={onShopping} className="rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white">{tr("View shopping list")}</button>}/><div className="rounded-2xl border bg-white p-5">{missing.length>0?<p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900"><AlertTriangle className="mr-2 inline size-4"/>{missing.length} insufficient ingredient(s)</p>:<p className="mb-5 text-sm text-green-700">{tr("No shortages for current orders.")}</p>}<div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b"><th className="py-3">{tr("Ingredient")}</th><th>{tr("Required")}</th><th>{tr("Available")}</th><th>{tr("Shortage")}</th></tr></thead><tbody>{used.map(r=><tr key={r.ingredient.id} className="border-b last:border-0"><td className="py-3 font-semibold">{r.ingredient.name}</td><td>{formatQuantity(r.required,r.ingredient.unit)}</td><td>{formatQuantity(r.available,r.ingredient.unit)}</td><td className={r.shortage>0?'font-bold text-red-700':'text-green-700'}>{formatQuantity(r.shortage,r.ingredient.unit)}</td></tr>)}</tbody></table></div></div></>
}

function ShoppingPage({ requirements,setStock }: { requirements: ReturnType<typeof calculateRequirements>; setStock: React.Dispatch<React.SetStateAction<StockItem[]>> }) { const {tr}=useLanguage();
  const missing=requirements.filter(r=>r.shortage>0)
  return <><PageHeading eyebrow="Workspace / Inventory" title="Shopping list" description="Live purchase quantities based on shortages across active orders." action={<button onClick={()=>window.print()} className="rounded-lg border px-4 py-2 text-sm"><FileText className="mr-2 inline size-4"/>{tr("Print")}</button>}/><div className="space-y-3 rounded-2xl border bg-white p-5">{missing.length===0?<p className="text-sm text-green-700">{tr("All current ingredient requirements can be met.")}</p>:missing.map(r=><div key={r.ingredient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h3 className="font-semibold">{r.ingredient.name}</h3><p className="text-xs text-gray-500">Required {formatQuantity(r.required,r.ingredient.unit)} · Stock {formatQuantity(r.available,r.ingredient.unit)}</p></div><div className="font-semibold text-red-700">Buy {formatQuantity(r.shortage,r.ingredient.unit)}</div><button onClick={()=>{const received=window.prompt(`Quantity of ${r.ingredient.name} received (${r.ingredient.unit})`,String(Number(r.shortage.toFixed(2))));if(received===null)return;const amount=Number(received);if(!Number.isFinite(amount)||amount<=0){alert('Enter a positive quantity');return}setStock(old=>old.map(s=>s.id===r.ingredient.id?{...s,quantity:s.quantity+amount}:s))}} className="rounded-lg bg-[#8e5e42] px-3 py-2 text-xs font-semibold text-white">{tr("Receive stock")}</button></div>)}</div></>
}

function PlanningPage() { const {tr}=useLanguage(); return <><PageHeading eyebrow="Workspace / Production" title="Production planning" description="A clear view of what needs to be baked and when." action={<button className="flex items-center gap-2 rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="size-4" /> Schedule batch</button>} /><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-serif text-lg font-bold">This week&apos;s production</h2><p className="mt-1 text-xs text-[#a29285]">Prioritized by delivery deadline</p></div><div className="flex items-center gap-2 text-xs text-[#9d8d80]"><span className="size-2 rounded-full bg-[#d19a4f]" /> Needs action <span className="ml-2 size-2 rounded-full bg-[#7b9d70]" /> Ready</div></div><div className="flex flex-col gap-3">{[['Alicia Wong','Peanut Biscuit + Butter Cookies','Today','Oct 28','In Progress'],['Benjamin Lee','Almond Biscuit','Tomorrow','Oct 29','Not started'],['Cindy Tan','Chocolate Chip','Oct 29','Oct 30','Scheduled']].map(([customer, item, start, due, status], i) => <div key={customer} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#f0e8e0] p-4"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-[#f4e9df] text-[#9b674b]"><Factory className="size-5" /></div><div><div className="text-sm font-semibold">{customer}</div><div className="mt-1 text-xs text-[#96877b]">{item}</div></div></div><div className="text-xs"><span className="text-[#a49487]">Start </span><b>{start}</b></div><div className="text-xs"><span className="text-[#a49487]">Due </span><b>{due}</b></div><StatusPill status={status === 'Not started' ? 'Pending' : status === 'Scheduled' ? 'Good' : 'In Progress'} /><button className="rounded-lg border border-[#e6dace] px-3 py-2 text-[11px] font-semibold text-[#81553d]">{i === 0 ? 'View job' : 'Start'}</button></div>)}</div></div></> }

function CalendarPage({ orders }: { orders: Order[] }) { const {tr}=useLanguage(); return <><PageHeading eyebrow="Workspace / Calendar" title="Order calendar" description="Stay ahead of every delivery and pickup deadline." action={<div className="flex items-center gap-2"><button className="rounded-lg border border-[#e4d9cf] bg-[#fffdf9] px-3 py-2 text-xs font-semibold">‹</button><span className="rounded-lg border border-[#e4d9cf] bg-[#fffdf9] px-4 py-2 text-xs font-semibold">October 2026</span><button className="rounded-lg border border-[#e4d9cf] bg-[#fffdf9] px-3 py-2 text-xs font-semibold">›</button></div>} /><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-4"><div className="grid grid-cols-7 border-b border-[#eee7df] pb-3 text-center text-[10px] font-bold uppercase tracking-wider text-[#b2a49a]">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}</div><div className="mt-2 grid grid-cols-7 gap-1">{Array.from({ length: 35 }, (_, i) => { const day = i - 3; const order = orders.find(o => Number(o.date.match(/\d+/)?.[0]) === day); return <div key={i} className={`min-h-[90px] rounded-lg border p-2 ${day === 27 ? 'border-[#bd8b6d] bg-[#fbf3ed]' : 'border-transparent hover:bg-[#faf6f1]'}`}><div className={`text-xs ${day === 27 ? 'font-bold text-[#8e5e42]' : 'text-[#a49589]'}`}>{day > 0 && day <= 31 ? day : ''}</div>{order && <div className="mt-2 rounded-md bg-[#f2e4d9] p-1.5 text-[10px] font-semibold leading-tight text-[#80563f]">{order.customer}<div className="mt-1 font-normal text-[#a07c68]">{order.items.split(',')[0]}</div></div>}</div> })}</div></div></> }

function NotificationsPage({ orders, requirements, onNavigate }: { orders: Order[]; requirements: ReturnType<typeof calculateRequirements>; onNavigate: (page:string)=>void }) {
  const {language,tr}=useLanguage()
  const [readKeys,setReadKeys]=useState<string[]>([])
  const [loaded,setLoaded]=useState(false)
  useEffect(()=>{try{const stored=localStorage.getItem('biscuitflow-read-alerts');if(stored)setReadKeys(JSON.parse(stored))}catch{}setLoaded(true)},[])
  function markRead(keys:string[]){setReadKeys(old=>{const next=Array.from(new Set([...old,...keys]));try{localStorage.setItem('biscuitflow-read-alerts',JSON.stringify(next))}catch{}return next})}
  const now=new Date()
  const notices=[
    ...requirements.filter(r=>r.shortage>0).map(r=>({key:'stock:'+r.ingredient.id+':'+r.shortage.toFixed(3),title:language==='zh'?'原材料不足':'Ingredient shortage',message:language==='zh'?r.ingredient.name+' 缺少 '+formatQuantity(r.shortage,r.ingredient.unit)+'，请及时补货。':r.ingredient.name+' is short by '+formatQuantity(r.shortage,r.ingredient.unit)+'. Please restock.',type:'stock'})),
    ...orders.filter(o=>o.status!=='Completed'&&o.status!=='Cancelled').flatMap(o=>{
      const deadline=new Date(o.date)
      if(Number.isNaN(deadline.getTime()))return []
      const days=Math.ceil((new Date(deadline.getFullYear(),deadline.getMonth(),deadline.getDate()).getTime()-new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime())/86400000)
      if(days>3)return []
      const due=days<0?(language==='zh'?'已逾期':'Overdue'):days===0?(language==='zh'?'今日到期':'Due today'):(language==='zh'?days+' 天后到期':'Due in '+days+' day(s)')
      return [{key:'due:'+o.id+':'+days,title:due,message:o.customer+' · '+o.items+' · '+o.date,type:'order'}]
    })
  ]
  return <><PageHeading eyebrow="Workspace / Alerts" title="Notifications" description={language==='zh'?'根据当前订单与库存计算的提醒。':'Alerts calculated from your current orders and ingredient stock.'} action={<button onClick={()=>markRead(notices.map(n=>n.key))} className="text-xs font-semibold text-[#98644a]">{tr("Mark all as read")}</button>}/>
  {notices.length===0?<div className="rounded-2xl border border-[#ebe3da] bg-white p-8 text-center text-sm text-[#81766d]">{language==='zh'?'目前没有库存不足或临近期限的订单提醒。':'No shortages or upcoming deadline alerts.'}</div>:<div className="flex flex-col gap-3">{notices.map(n=><div key={n.key} className="flex items-start gap-4 rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="rounded-xl bg-[#fff0df] p-2.5 text-[#ba762b]">{n.type==='stock'?<AlertTriangle className="size-4"/>:<Clock3 className="size-4"/>}</div><div className="flex-1"><h3 className="text-sm font-semibold">{n.title}{loaded&&!readKeys.includes(n.key)&&<span className="ml-2 inline-block size-2 rounded-full bg-[#bd6b48]"/>}</h3><p className="mt-1.5 text-xs text-[#8f8176]">{n.message}</p><button onClick={()=>onNavigate(n.type==='stock'?'Ingredient Calculator':'Customer Orders')} className="mt-2 text-xs font-semibold text-[#8e5e42] underline">{language==='zh'?'查看详情':'View details'}</button></div><button type="button" aria-label={language==='zh'?'标为已读':'Mark as read'} title={language==='zh'?'标为已读':'Mark as read'} onClick={()=>markRead([n.key])} className="rounded p-2 text-[#aa9b8f] hover:bg-[#f8f2eb]"><Check className="size-4"/></button></div>)}</div>}</>
}

function SettingsPage() { const {tr}=useLanguage(); return <><PageHeading eyebrow="Workspace / Preferences" title="Settings" description="Tune BiscuitFlow to match the way your bakery works." /><div className="grid gap-6 xl:grid-cols-2"><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><h2 className="font-serif text-lg font-bold">{tr("Business profile")}</h2><p className="mt-1 text-xs text-[#a29285]">The details customers see on your order records.</p><div className="mt-5 flex flex-col gap-4"><label className="text-xs font-semibold">{tr("Business name")}<input defaultValue="Maya&apos;s Home Bakery" className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm" /></label><label className="text-xs font-semibold">{tr("Currency")}<select defaultValue="MYR" className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm"><option>MYR — Malaysian Ringgit</option><option>USD — US Dollar</option></select></label></div></div><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><h2 className="font-serif text-lg font-bold">{tr("Deadline reminders")}</h2><p className="mt-1 text-xs text-[#a29285]">Choose when BiscuitFlow should call attention to orders.</p><div className="mt-5 flex flex-col gap-4"><label className="text-xs font-semibold">Due soon threshold<select defaultValue="3 days" className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm"><option>3 days before</option><option>5 days before</option><option>7 days before</option></select></label><label className="flex items-center justify-between rounded-xl bg-[#f7f0e9] p-3.5 text-xs font-semibold">Show low stock warnings <input type="checkbox" defaultChecked className="size-4 accent-[#8e5e42]" /></label></div></div></div></> }
