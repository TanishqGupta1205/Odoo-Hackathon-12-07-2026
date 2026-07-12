import React, { useState, useEffect } from 'react';

const Dashboard = () => {
  const [data, setData] = useState({
    kpis: {
      totalVehicles: 0,
      availableVehicles: 0,
      activeVehicles: 0, // ON_TRIP [cite: 20]
      inMaintenance: 0,  // IN_SHOP [cite: 20]
      activeTrips: 0,    // [cite: 20]
      utilization: 0,    // [cite: 20]
      fuelEfficiency: 0, // [cite: 42]
      operationalCost: 0,// [cite: 42]
      roi: 0             // [cite: 42]
    },
    recentTrips: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ region: '', vehicleType: '', vehicleStatus: '' });

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token'); 
      const queryParams = new URLSearchParams();
      if (filters.region) queryParams.append('region', filters.region);
      if (filters.vehicleType) queryParams.append('vehicleType', filters.vehicleType);
      if (filters.vehicleStatus) queryParams.append('vehicleStatus', filters.vehicleStatus);

      const response = await fetch(`http://localhost:5000/api/dashboard?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, // [cite: 97]
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) throw new Error("Unauthorized! Please login again. [cite: 521]");
      const result = await response.json();

      if (response.ok) {
        setData({
          kpis: result.kpis || result.data?.kpis || data.kpis,
          recentTrips: result.recentTrips || result.data?.recentTrips || []
        });
      } else {
        throw new Error(result.message || "Failed to fetch dashboard data");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [filters]);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-white relative overflow-hidden p-4 sm:p-6 lg:p-8">
      
      {/* Premium Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Top Navigation / Header */}
      <div className="relative z-10 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-800 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold tracking-widest text-cyan-400 uppercase">TransitOps Live Platform [cite: 3]</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Operations Control Center
          </h1>
        </div>

        {/* Dynamic Interactive Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select 
            name="region" 
            value={filters.region} 
            onChange={(e) => setFilters({...filters, region: e.target.value})}
            className="bg-[#0f172a] border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-300 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none cursor-pointer transition-all shadow-inner"
          >
            <option value="">All Regions [cite: 21]</option>
            <option value="Pune">Pune [cite: 160]</option>
            <option value="Mumbai">Mumbai [cite: 187]</option>
          </select>

          <select 
            name="vehicleType" 
            value={filters.vehicleType} 
            onChange={(e) => setFilters({...filters, vehicleType: e.target.value})}
            className="bg-[#0f172a] border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-300 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none cursor-pointer transition-all shadow-inner"
          >
            <option value="">All Vehicles [cite: 21]</option>
            <option value="Van">Van [cite: 156]</option>
            <option value="Truck">Truck</option>
          </select>

          <button 
            onClick={fetchDashboardData}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-[0_4px_20px_-4px_rgba(6,182,212,0.4)] active:scale-95"
          >
            🔄 Sync Data
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-semibold text-red-400 flex items-center gap-3">
          <span>⚠️</span> {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col justify-center items-center h-96 gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-t-transparent border-cyan-400"></div>
          <p className="text-xs text-slate-500 font-bold tracking-widest uppercase animate-pulse">Assembling Fleet Data...</p>
        </div>
      ) : (
        <div className="relative z-10 max-w-7xl mx-auto space-y-8">
          
          {/* Main Core KPIs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard title="Available Fleet" value={data.kpis.availableVehicles} desc="Ready to dispatch" icon="🚚" gradient="from-emerald-500/10 to-teal-500/5" border="border-emerald-500/20" textStyle="text-emerald-400" />
            <KpiCard title="Active En Route" value={data.kpis.activeVehicles} desc="On-trip status" icon="🛣️" gradient="from-blue-500/10 to-indigo-500/5" border="border-blue-500/20" textStyle="text-blue-400" />
            <KpiCard title="Under Maintenance" value={data.kpis.inMaintenance} desc="In workshop bay" icon="🔧" gradient="from-amber-500/10 to-orange-500/5" border="border-amber-500/20" textStyle="text-amber-400" />
            <KpiCard title="Fleet Utilization" value={`${data.kpis.utilization}%`} desc="Asset performance" icon="📊" gradient="from-cyan-500/10 to-blue-500/5" border="border-cyan-500/20" textStyle="text-cyan-400" />
          </div>

          {/* Analytics & Cost Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricBlock title="Fuel Efficiency [cite: 42]" value={`${data.kpis.fuelEfficiency} km/L`} subtitle="Fleet Avg Efficiency" icon="⛽" color="border-yellow-500/30" />
            <MetricBlock title="Operational Cost [cite: 39, 42]" value={`₹${Number(data.kpis.operationalCost).toLocaleString('en-IN')}`} subtitle="Fuel + Maintenance [cite: 39]" icon="💸" color="border-rose-500/30" />
            <MetricBlock title="Vehicle Return on Investment (ROI) [cite: 42]" value={`${data.kpis.roi}%`} subtitle="Net Financial Health" icon="📈" color="border-purple-500/30" />
          </div>

          {/* Recent Dispatched Operations Table */}
          <div className="bg-[#0f172a]/60 backdrop-blur-xl rounded-3xl border border-slate-800/80 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center bg-[#1e293b]/20">
              <div>
                <h2 className="text-lg font-bold text-white">Live Dispatched Registry </h2>
                <p className="text-xs text-slate-400 mt-0.5">Real-time update stream of currently running tracking routes</p>
              </div>
              <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
                Count: {data.recentTrips.length}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0b0f19] text-slate-400 text-xs font-bold tracking-wider uppercase border-b border-slate-800">
                    <th className="py-4 px-6">Tracking Key</th>
                    <th className="py-4 px-6">Route Vector</th>
                    <th className="py-4 px-6">Asset Reference</th>
                    <th className="py-4 px-6">Status Signature</th>
                    <th className="py-4 px-6 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.recentTrips.length > 0 ? (
                    data.recentTrips.map((trip, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors duration-150">
                        <td className="py-4 px-6 font-mono text-xs font-bold text-cyan-400">
                          #{trip.id?.substring(0, 8).toUpperCase() || `TRIP-${100 + idx}`}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                            <span>{trip.source}</span>
                            <span className="text-xs text-slate-500">➔</span>
                            <span>{trip.destination}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-xs font-mono font-medium text-slate-400">
                          {trip.vehicleId || "MH12-TATA-05"}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            trip.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            trip.status === 'DISPATCHED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              trip.status === 'COMPLETED' ? 'bg-emerald-400' :
                              trip.status === 'DISPATCHED' ? 'bg-blue-400' : 'bg-slate-400'
                            }`}></span>
                            {trip.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs text-right font-medium text-slate-500">
                          {trip.date || "Just Now"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-slate-500 text-sm font-medium">
                        📭 No operational matching records active for selected criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable Custom Glassmorphic Premium KPI Card Component
const KpiCard = ({ title, value, desc, icon, gradient, border, textStyle }) => (
  <div className={`bg-[#0f172a]/40 backdrop-blur-xl p-6 rounded-3xl border ${border} bg-gradient-to-br ${gradient} shadow-xl hover:scale-[1.02] transition-all duration-200 group`}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-slate-400 text-xs font-bold tracking-wider uppercase mb-1">{title}</p>
        <h3 className={`text-4xl font-black tracking-tight ${textStyle} mb-1`}>{value}</h3>
        <p className="text-slate-500 text-xs font-medium">{desc}</p>
      </div>
      <div className="text-2xl bg-[#1e293b]/80 border border-slate-800 p-3.5 rounded-2xl group-hover:bg-[#1e293b] transition-colors shadow-md">
        {icon}
      </div>
    </div>
  </div>
);

// Reusable Analytical Metric Block Component
const MetricBlock = ({ title, value, subtitle, icon, color }) => (
  <div className={`bg-[#0f172a]/30 backdrop-blur-md p-5 rounded-2xl border ${color} shadow-lg flex items-center justify-between`}>
    <div>
      <h4 className="text-xs font-bold text-slate-400 tracking-wide uppercase mb-0.5">{title}</h4>
      <div className="text-2xl font-black text-white tracking-tight">{value}</div>
      <p className="text-[11px] text-slate-500 font-medium mt-0.5">{subtitle}</p>
    </div>
    <div className="text-xl bg-slate-900/60 p-3 rounded-xl border border-slate-800/50">{icon}</div>
  </div>
);

export default Dashboard;