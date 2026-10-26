import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic='force-dynamic'
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 if(!url||!key)return null
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
export async function GET(){
 const db=client()
 if(!db)return NextResponse.json({error:'Store is not configured'},{status:503})
 const {data,error}=await db.rpc('guest_biscuit_catalog')
 if(error)return NextResponse.json({error:'Catalog is temporarily unavailable'},{status:503})
 return NextResponse.json({products:data??[]},{headers:{'Cache-Control':'no-store'}})
}
export async function POST(request:Request){
 const db=client()
 if(!db)return NextResponse.json({error:'Store is not configured'},{status:503})
 const size=Number(request.headers.get('content-length')||0)
 if(size>8192)return NextResponse.json({error:'Request too large'},{status:413})
 let body:unknown
 try{body=await request.json()}catch{return NextResponse.json({error:'Invalid request'},{status:400})}
 if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Invalid request'},{status:400})
 const b=body as Record<string,unknown>
 if(typeof b.name!=='string'||typeof b.phone!=='string'||typeof b.email!=='string'||typeof b.dueDate!=='string'||!Array.isArray(b.items))return NextResponse.json({error:'Complete your contact details and order'},{status:400})
 if(b.name.length>100||b.phone.length>24||b.email.length>180||b.dueDate.length!==10||b.items.length>10)return NextResponse.json({error:'Invalid order size'},{status:400})
 const {data,error}=await db.rpc('submit_guest_biscuit_order',{p_name:b.name,p_phone:b.phone,p_email:b.email,p_due_date:b.dueDate,p_items:b.items})
 if(error)return NextResponse.json({error:error.message},{status:400})
 return NextResponse.json({orderId:data},{status:201,headers:{'Cache-Control':'no-store'}})
}
