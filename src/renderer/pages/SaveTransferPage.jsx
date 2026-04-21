import React, { useState, useEffect } from 'react';
import { 
  ArrowRightLeft, Save, Coins, Package, Heart, ShieldAlert, 
  ArrowRight, Info, Check, RefreshCw, X, ChevronRight, AlertTriangle, Tractor, MapPin, Box
} from 'lucide-react';
import { useSavegameStore } from '../store/useSavegameStore';
import { useToastStore } from '../store/useToastStore';
import { useScrollPersistence } from '../hooks/useScrollPersistence';

export default function SaveTransferPage() {
  const { savegames, fetchSavegames } = useSavegameStore();
  const [sourceIdx, setSourceIdx] = useState(null);
  const [destIdx, setDestIdx] = useState(null);
  
  const productsScrollRef = useScrollPersistence('save-transfer-products');
  const animalsScrollRef = useScrollPersistence('save-transfer-animals');
  const vehiclesScrollRef = useScrollPersistence('save-transfer-vehicles');
  const itemsScrollRef = useScrollPersistence('save-transfer-items');
  const [sourceData, setSourceData] = useState(null);
  const [destData, setDestData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  
  const [transferMoney, setTransferMoney] = useState(false);
  const [moneyAmount, setMoneyAmount] = useState(0);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedAnimals, setSelectedAnimals] = useState(new Set());
  const [selectedVehicles, setSelectedVehicles] = useState(new Set());
  const [transferFarmland, setTransferFarmland] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  const sourceSave = savegames.find(s => s.index === parseInt(sourceIdx));
  const destSave = savegames.find(s => s.index === parseInt(destIdx));

  useEffect(() => {
    if (sourceSave) loadSourceData();
    else setSourceData(null);
  }, [sourceIdx]);

  useEffect(() => {
    if (destSave) loadDestData();
    else setDestData(null);
  }, [destIdx]);

  const loadSourceData = async () => {
    setLoading(true);
    const data = await window.api.savegames.getTransferData({ savePath: sourceSave.path });
    setSourceData(data);
    setMoneyAmount(data.money);
    setLoading(false);
  };

  const loadDestData = async () => {
    const data = await window.api.savegames.getTransferData({ savePath: destSave.path });
    setDestData(data);
  };

  const handleTransfer = async () => {
    if (!sourceSave || !destSave) return;
    if (sourceIdx === destIdx) {
      useToastStore.getState().error("Source and destination cannot be the same!");
      return;
    }

    setTransferring(true);
    try {
      const result = await window.api.savegames.executeTransfer({
        sourcePath: sourceSave.path,
        destPath: destSave.path,
        options: {
          transferMoney,
          moneyAmount,
          selectedProducts: Array.from(selectedProducts),
          selectedAnimals: Array.from(selectedAnimals),
          selectedVehicles: Array.from(selectedVehicles),
          transferFarmland,
          selectedItems: Array.from(selectedItems)
        }
      });

      if (result.success) {
        useToastStore.getState().success("Transfer completed successfully!");
        fetchSavegames();
        loadDestData();
      } else {
        useToastStore.getState().error(result.error);
      }
    } catch (err) {
      useToastStore.getState().error("Transfer failed: " + err.message);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <div className="page-header__content">
          <h1 className="page-header__title">
            <ArrowRightLeft className="page-header__icon text-accent" />
            Save Transfer
          </h1>
          <p className="page-header__subtitle">
            Transfer money, products, and animals between career slots with capacity validation.
          </p>
        </div>
      </div>

      {/* ── IN DEVELOPMENT BANNER ── */}
      <div className="card" style={{ 
        marginBottom: 24, 
        padding: '16px 24px', 
        background: 'rgba(234, 179, 8, 0.1)', 
        border: '1px solid rgba(234, 179, 8, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ 
          width: 40, 
          height: 40, 
          borderRadius: '50%', 
          background: 'rgba(234, 179, 8, 0.2)', 
          color: '#eab308', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <AlertTriangle size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#eab308', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature in Development</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The Save Transfer system is currently undergoing stability testing and is disabled in this version.</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, padding: '4px 12px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', borderRadius: 20 }}>COMING SOON</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Source Selection */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>1</div>
            SOURCE SAVEGAME
          </h3>
          <select 
            value={sourceIdx || ''} 
            onChange={e => setSourceIdx(e.target.value)}
            disabled
            className="input--full"
            style={{ padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', opacity: 0.5, cursor: 'not-allowed' }}
          >
            <option value="">Select a slot...</option>
            {savegames.filter(s => !s.isEmpty).map(s => (
              <option key={s.index} value={s.index}>Slot {s.index}: {s.farmName} ({s.mapTitle})</option>
            ))}
          </select>

          {sourceData && (
            <div className="animate-slide-down" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
               <div style={{ padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border)' }}>
                 <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 800, marginBottom: 4 }}>AVAILABLE FUNDS</div>
                 <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Coins size={18} /> ${sourceData.money.toLocaleString()}
                 </div>
               </div>
               
               <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 800, marginBottom: 4 }}>PRODUCTS</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{sourceData.products?.length || 0} Items</div>
                  </div>
                  <div style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 800, marginBottom: 4 }}>VEHICLES</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{sourceData.vehicles?.length || 0} Units</div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Destination Selection */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>2</div>
            DESTINATION SAVEGAME
          </h3>
          <select 
            value={destIdx || ''} 
            onChange={e => setDestIdx(e.target.value)}
            disabled
            className="input--full"
            style={{ padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', opacity: 0.5, cursor: 'not-allowed' }}
          >
            <option value="">Select a slot...</option>
            {savegames.filter(s => !s.isEmpty).map(s => (
              <option key={s.index} value={s.index}>Slot {s.index}: {s.farmName} ({s.mapTitle})</option>
            ))}
          </select>

          {destData && (
            <div className="animate-slide-down" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
               <div style={{ padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border)' }}>
                 <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 800, marginBottom: 4 }}>CURRENT FUNDS</div>
                 <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Coins size={18} /> ${destData.money.toLocaleString()}
                 </div>
               </div>
               
               <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 800, marginBottom: 4 }}>STORAGE LOAD</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{destData.products?.length || 0} Types</div>
                  </div>
                  <div style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 800, marginBottom: 4 }}>FLEET SIZE</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{destData.vehicles?.length || 0} Units</div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>

      {sourceData && destData && (
        <div className="animate-slide-up">
           <div className="card" style={{ padding: 24, border: '1px solid var(--accent-dim)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                 <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>Configure Transfer</h2>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Choose what you want to move from Slot {sourceIdx} to Slot {destIdx}</p>
                 </div>
                 <ArrowRightLeft size={32} className="text-accent" style={{ opacity: 0.2 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
                 {/* Money Section */}
                 <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                       <div style={{ padding: 8, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: 8 }}>
                          <Coins size={20} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>Financial Assets</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Move cash between accounts</div>
                       </div>
                       <input 
                         type="checkbox" 
                         checked={transferMoney} 
                         onChange={e => setTransferMoney(e.target.checked)}
                         style={{ width: 20, height: 20, accentColor: '#22c55e' }}
                       />
                    </div>
                    
                    {transferMoney && (
                      <div className="animate-slide-down">
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>TRANSFER AMOUNT</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                           <input 
                             type="range" 
                             min="0" 
                             max={sourceData.money} 
                             value={moneyAmount} 
                             onChange={e => setMoneyAmount(parseInt(e.target.value))}
                             style={{ flex: 1 }}
                           />
                           <div style={{ width: 100, textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>
                             ${moneyAmount.toLocaleString()}
                           </div>
                        </div>
                        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                           <ArrowRight size={14} className="text-accent" />
                           New Balance: <span style={{ fontWeight: 800 }}>${(destData.money + moneyAmount).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                 </div>

                 {/* Products Section */}
                 <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                       <div style={{ padding: 8, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: 8 }}>
                          <Package size={20} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>Grain & Products</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Requires empty silo space</div>
                       </div>
                    </div>
                    
                    <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                       {!sourceData.products || sourceData.products.length === 0 ? (
                         <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>No products found in source.</div>
                       ) : (
                         sourceData.products.map((p, i) => (
                           <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6, border: '1px solid var(--border-light)' }}>
                              <div style={{ flex: 1 }}>
                                 <div style={{ fontSize: 11, fontWeight: 700 }}>{p.fillType.replace('FILLTYPE_', '')}</div>
                                 <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{p.fillLevel.toLocaleString()} L</div>
                              </div>
                              <input 
                                type="checkbox" 
                                checked={selectedProducts.has(p.fillType)}
                                onChange={e => {
                                  const next = new Set(selectedProducts);
                                  if (e.target.checked) next.add(p.fillType);
                                  else next.delete(p.fillType);
                                  setSelectedProducts(next);
                                }}
                                style={{ accentColor: '#3b82f6' }}
                              />
                           </div>
                         ))
                       )}
                    </div>
                 </div>

                  {/* Animals Section */}
                  <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                       <div style={{ padding: 8, background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', borderRadius: 8 }}>
                          <Heart size={20} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>Livestock & Animals</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Requires animal barns</div>
                       </div>
                    </div>
                    
                    <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                       {!sourceData.animals || sourceData.animals.length === 0 ? (
                         <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>No animals found in source.</div>
                       ) : (
                         sourceData.animals.map((a, i) => (
                           <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6, border: '1px solid var(--border-light)' }}>
                              <div style={{ flex: 1 }}>
                                 <div style={{ fontSize: 11, fontWeight: 700 }}>{a.subType || a.type}</div>
                                 <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Age: {a.age} | Health: {a.health}%</div>
                              </div>
                              <input 
                                type="checkbox"
                                checked={selectedAnimals.has(i)}
                                onChange={e => {
                                  const next = new Set(selectedAnimals);
                                  if (e.target.checked) next.add(i);
                                  else next.delete(i);
                                  setSelectedAnimals(next);
                                }}
                                style={{ accentColor: '#ec4899' }}
                              />
                           </div>
                         ))
                       )}
                    </div>
                 </div>

                 {/* Vehicles Section */}
                 <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)', gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                       <div style={{ padding: 8, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', borderRadius: 8 }}>
                          <Tractor size={20} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>Vehicles & Equipment</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Transfer machines with operating hours and condition</div>
                       </div>
                       <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn--ghost btn--xs" onClick={() => setSelectedVehicles(new Set(sourceData.vehicles.map((_, i) => i)))}>Select All</button>
                          <button className="btn btn--ghost btn--xs" onClick={() => setSelectedVehicles(new Set())}>Clear</button>
                       </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 300, overflowY: 'auto' }} ref={vehiclesScrollRef}>
                       {!sourceData.vehicles || sourceData.vehicles.length === 0 ? (
                         <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>No vehicles found in source.</div>
                       ) : (
                         sourceData.vehicles.map((v, i) => {
                           const name = v.filename.split('/').pop().replace('.xml', '').replace(/_/g, ' ').toUpperCase();
                           const hours = (v.operatingTime / 3600).toFixed(1);
                           const condition = ((1 - v.wear) * 100).toFixed(0);

                           return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
                               <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                                     <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Hours: <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{hours}h</span></div>
                                     <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Condition: <span style={{ color: condition < 30 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>{condition}%</span></div>
                                  </div>
                               </div>
                               <input 
                                 type="checkbox"
                                 checked={selectedVehicles.has(i)}
                                 onChange={e => {
                                   const next = new Set(selectedVehicles);
                                   if (e.target.checked) next.add(i);
                                   else next.delete(i);
                                   setSelectedVehicles(next);
                                 }}
                                 style={{ accentColor: '#f59e0b' }}
                               />
                            </div>
                           );
                         })
                       )}
                    </div>
                 </div>

                 {/* Farmland Section */}
                 <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                       <div style={{ padding: 8, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: 8 }}>
                          <MapPin size={20} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>Owned Farmland</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Transfer land ownership</div>
                       </div>
                       <input 
                         type="checkbox" 
                         checked={transferFarmland} 
                         onChange={e => setTransferFarmland(e.target.checked)}
                         style={{ width: 20, height: 20, accentColor: '#22c55e' }}
                       />
                    </div>
                 </div>

                 {/* Loose Items Section */}
                 <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                       <div style={{ padding: 8, background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', borderRadius: 8 }}>
                          <Box size={20} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>Loose Items</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Bales, pallets, and hand tools</div>
                       </div>
                    </div>
                    
                    <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                       {!sourceData.items || sourceData.items.length === 0 ? (
                         <div style={{ textAlign: 'center', padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>No items found in world.</div>
                       ) : (
                         sourceData.items.map((item, i) => (
                           <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6, border: '1px solid var(--border-light)' }}>
                              <div style={{ flex: 1 }}>
                                 <div style={{ fontSize: 11, fontWeight: 700 }}>{item.className} ({item.fillType?.replace('FILLTYPE_', '') || 'Empty'})</div>
                                 <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.fillLevel.toLocaleString()} L</div>
                              </div>
                              <input 
                                type="checkbox"
                                checked={selectedItems.has(i)}
                                onChange={e => {
                                  const next = new Set(selectedItems);
                                  if (e.target.checked) next.add(i);
                                  else next.delete(i);
                                  setSelectedItems(next);
                                }}
                                style={{ accentColor: '#a855f7' }}
                              />
                           </div>
                         ))
                       )}
                    </div>
                 </div>
              </div>

              {/* Warnings */}
              {(selectedProducts.size > 0 || selectedAnimals.size > 0 || selectedVehicles.size > 0 || transferFarmland || selectedItems.size > 0) && (
                <div style={{ marginTop: 24, padding: 16, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: 8, display: 'flex', gap: 12 }}>
                   <AlertTriangle className="text-yellow-500" size={20} style={{ marginTop: 2 }} />
                   <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#eab308' }}>TRANSFER CAUTION</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                         {sourceSave?.mapTitle !== destSave?.mapTitle && transferFarmland && (
                           <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 4 }}>⚠️ Maps do not match! Farmland IDs will be incorrect on the destination.</p>
                         )}
                         {sourceSave?.mapTitle !== destSave?.mapTitle && selectedItems.size > 0 && (
                           <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 4 }}>⚠️ Maps do not match! Items (Bales/Pallets) may spawn at incorrect locations.</p>
                         )}
                         Ensure Slot {destIdx} has functional silos and barns to accommodate products/animals.
                      </div>
                   </div>
                </div>
              )}

              {/* Execution */}
              <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
                 <button 
                   className="btn btn--primary btn--lg" 
                   style={{ minWidth: 280, height: 56, fontSize: 16, gap: 12 }}
                   disabled={true}
                   onClick={handleTransfer}
                 >
                   <ShieldAlert size={20} />
                   Feature Disabled
                 </button>
              </div>
           </div>
        </div>
      )}

      {(!sourceData || !destData) && (
        <div style={{ marginTop: 100, textAlign: 'center', opacity: 0.15 }}>
           <ArrowRightLeft size={64} style={{ marginBottom: 24 }} />
           <p style={{ fontSize: 16, fontWeight: 700 }}>System Currently Disabled</p>
        </div>
      )}
    </div>
  );
}
