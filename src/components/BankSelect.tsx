'use client';
import { useState } from 'react';

/** Bank picker that posts both the Paystack bank code and the bank's display name. */
export function BankSelect({ banks }: { banks: { name: string; code: string }[] }) {
  const [name, setName] = useState('');
  return <>
    <select className="sel" name="bank_code" id="ps-bank" required defaultValue="" onChange={(e) => setName(e.target.selectedOptions[0]?.text || '')}>
      <option value="" disabled>Choose your bank</option>
      {banks.map((x) => <option key={x.code + x.name} value={x.code}>{x.name}</option>)}
    </select>
    <input type="hidden" name="bank_name" value={name} />
  </>;
}
