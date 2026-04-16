"use client";

import { useState } from "react";

type Entry = {
  id: string;
  type: string;
  calories: number;
  description: string;
  date: string;
};

export function CalorieTrackerClient({ 
  initialEntries, 
  userProfileId 
}: { 
  initialEntries: Entry[];
  userProfileId: string;
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("breakfast");
  const [calories, setCalories] = useState("");
  const [description, setDescription] = useState("");

  const dailyGoal = 2000; // Base TDEE estimate
  const deficitGoal = 500;
  const targetCalories = dailyGoal - deficitGoal;

  const today = new Date().toISOString().split("T")[0];
  const todayEntries = entries.filter(e => e.date.startsWith(today));
  const todayTotal = todayEntries.reduce((sum, e) => sum + e.calories, 0);
  
  const weekTotal = entries.reduce((sum, e) => sum + e.calories, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calories || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          calories: parseInt(calories),
          description,
          userProfileId,
        }),
      });

      if (res.ok) {
        const newEntry = await res.json();
        setEntries([newEntry, ...entries]);
        setCalories("");
        setDescription("");
      }
    } catch (err) {
      console.error("Error adding entry:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/calories?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntries(entries.filter(e => e.id !== id));
      }
    } catch (err) {
      console.error("Error deleting entry:", err);
    }
  };

  return (
    <div className="space-y-10">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-5 space-y-1">
          <p className="text-[#F5F5F5]/40 text-xs uppercase font-bold tracking-widest">Today</p>
          <p className="text-2xl font-bold text-[#E8FF00]">{todayTotal} <span className="text-sm font-normal text-[#F5F5F5]/50">kcal</span></p>
        </div>
        <div className="glass-panel rounded-2xl p-5 space-y-1">
          <p className="text-[#F5F5F5]/40 text-xs uppercase font-bold tracking-widest">Weekly</p>
          <p className="text-2xl font-bold">{weekTotal} <span className="text-sm font-normal text-[#F5F5F5]/50">kcal</span></p>
        </div>
      </div>

      {/* Deficit Progress */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-end">
          <h3 className="text-sm font-bold uppercase tracking-widest text-[#F5F5F5]/60">Daily Deficit Goal</h3>
          <p className="text-xs font-mono">
            {todayTotal} / {targetCalories} kcal
          </p>
        </div>
        <div className="h-2 w-full bg-[#F5F5F5]/10 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${todayTotal > targetCalories ? 'bg-red-500' : 'bg-[#E8FF00]'}`}
            style={{ width: `${Math.min(100, (todayTotal / targetCalories) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-[#F5F5F5]/40">
          {todayTotal > targetCalories 
            ? `You are ${todayTotal - targetCalories} kcal over your deficit target.` 
            : `You have ${targetCalories - todayTotal} kcal remaining to hit your ${deficitGoal} kcal deficit.`}
        </p>
      </div>

      {/* Add Entry Form */}
      <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value)}
            className="bg-[#1A1A1A] border border-[#F5F5F5]/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#E8FF00]/50"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
          <input 
            type="number" 
            placeholder="Calories" 
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            className="bg-[#1A1A1A] border border-[#F5F5F5]/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#E8FF00]/50"
            required
          />
        </div>
        <input 
          type="text" 
          placeholder="Description (optional)" 
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-[#1A1A1A] border border-[#F5F5F5]/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#E8FF00]/50"
        />
        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-[#E8FF00] text-[#0A0A0A] font-bold text-sm transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add Entry"}
        </button>
      </form>

      {/* Recent Entries */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#E8FF00]">Recent Entries</h3>
        <div className="space-y-3">
          {entries.length === 0 ? (
            <p className="text-sm text-[#F5F5F5]/30 text-center py-4">No entries yet this week.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="glass-panel rounded-xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold capitalize">{entry.type} <span className="text-[10px] font-normal text-[#F5F5F5]/40 ml-2">{new Date(entry.date).toLocaleDateString()}</span></p>
                  {entry.description && <p className="text-xs text-[#F5F5F5]/50">{entry.description}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-mono text-sm">{entry.calories} kcal</p>
                  <button 
                    onClick={() => handleDelete(entry.id)}
                    className="text-[#F5F5F5]/20 hover:text-red-500 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
