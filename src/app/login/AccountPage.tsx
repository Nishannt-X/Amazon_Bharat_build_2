"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import type { Account,GarageCar } from "../../lib/account-store";
import AccountForm from "../../components/AccountForm";
import VehicleContextPanel from "../../components/VehicleContextPanel";
import ThemeToggle from "../../components/ThemeToggle";
export default function AccountPage(){
 const [account,setAccount]=useState<Account|null>(null);const [cars,setCars]=useState<GarageCar[]>([]);const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/account",{cache:"no-store"}).then(r=>r.json()).then(d=>{setAccount(d.account);setCars(d.cars);}).catch(()=>setError("Session could not load. Retry this page."));},[]);
 async function logout(){const r=await fetch("/api/account",{method:"DELETE"});if(r.ok){setAccount(null);setCars([]);}else setError("Logout failed. Retry.");}
 return <main className="ff-themed ff-account-page"><Link href="/report">← Return to your report</Link><ThemeToggle/>{error&&<p role="alert">{error}</p>}{account?<><div className="ff-account-session"><span>{account.email}</span><button onClick={()=>void logout()}>Logout</button></div><VehicleContextPanel accountCars={cars} canSaveCar onCarsChange={setCars}/></>:<section><h1>Your FloodFlow garage</h1><AccountForm onAccount={(user,saved)=>{setAccount(user);setCars(saved);}}/></section>}</main>;
}
