import React, { useState, useEffect } from 'react';

const Dashboard = () => {
  // State matching EXACTLY with your dashboard.controller.js response
  const [data, setData] = useState({
    kpis: {},
    analytics: {},
    charts: {
      vehicleStatusDistribution: [],
      monthlyFinancialData: []
    },
    recentTrips: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters matching backend queries
  const [filters, setFilters] = useState({
    region: '',
    vehicleType: '',
    vehicleStatus: '',
    from: '',
    to: ''
  });

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetching the JWT token saved during login
      const token = localStorage.getItem('token'); 
      const queryParams = new URLSearchParams();
      
      // Appending filters to API URL
      if (filters.region) queryParams.append('region', filters.region);
      if (filters.vehicleType) queryParams.append('vehicleType', filters.vehicleType);
      if (filters.vehicleStatus) queryParams.append('vehicleStatus', filters.vehicleStatus);
      if (filters.from) queryParams.append('from', filters.from);
      if (filters.to) queryParams.append('to', filters.to);

      // Final API Call to your local backend
      const response = await fetch(`http://localhost:5000/api/dashboard?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, //
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) throw new Error("Session expired. Please login again.");
      const result = await response.json();

      if (response.ok && result.success) {
        // Mapping exactly to your backend response format
        setData({
          kpis: result.kpis || {},
          analytics: result.analytics || {},
          charts: result.charts || { vehicleStatusDistribution: [], monthlyFinancialData: [] },
          recentTrips: result.recentTrips || []
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
    <div className="min-h-screen bg-[#030712] text-slate-100 font-sans p-4 sm:p-6 lg:p-8 relative overflow-y-auto">
      
      {/* Background Glows for Premium Feel */}
      <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[150px] pointer-events-none"></div>

      {/* 1. Header & Filters Section */}
      <div className="relative z-10 max-w-7xl mx-auto flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 pb-6 border-b border-slate-800 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Fleet Command Center</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time transport operations & financial insights</p>
        </div>

        {/* Dynamic Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="date" name="from" value={filters.from} onChange={(e) => setFilters({...filters, from: e.target.value})}
            className="bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-cyan-500 transition-colors"
          />
          <input 
            type="date" name="to" value={filters.to} onChange={(e) => setFilters({...filters, to: e.target.value})}
            className="bg-[#0f172a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-cyan-500 transition-colors"
          />
          <select 
            name="vehicleStatus" value={filters.vehicleStatus} onChange={(e) => setFilters({...filters, vehicleStatus: e.target.value})}
            className="bg-[#0f172a] border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-300 outline-none focus:border-cyan-500 transition-colors cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON_TRIP">On Trip</option>
            <option value="IN_SHOP">In Shop</option>
          </select>
          <select 
            name="region" value={filters.region} onChange={(e) => setFilters({...filters, region: e.target.value})}
            className="bg-[#0f172a] border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-300 outline-none focus:border-cyan-500 transition-colors cursor-pointer"
          >
            <option value="">All Regions</option>
            <option value="Pune">Pune</option>
            <option value="Mumbai">Mumbai</option>
          </select>

          <button onClick={fetchDashboardData} className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold py-2 px-4 rounded-xl transition-all shadow-lg active:scale-95">
            Refresh Data
          </button>
        </div>
      </div>

      {error && <div className="max-w-7xl mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-bold flex items-center gap-2">⚠️ {error}</div>}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
        </div>
      ) : (
        <div className="relative z-10 max-w-7xl mx-auto space-y-8">
          
          {/* 2. Operational KPIs Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <KpiCard title="Available Fleet" value={data.kpis.availableVehicles || 0} icon="🚚" color="text-emerald-400" />
            <KpiCard title="Vehicles On Trip" value={data.kpis.vehiclesOnTrip || 0} icon="🛣️" color="text-blue-400" />
            <KpiCard title="In Maintenance" value={data.kpis.vehiclesInMaintenance || 0} icon="🔧" color="text-orange-400" />
            <KpiCard title="Fleet Utilization" value={`${data.kpis.fleetUtilization || 0}%`} icon="📈" color="text-cyan-400" />
          </div>

          {/* 3. Financial Analytics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricBlock title="Fuel Efficiency" value={`${data.analytics.fuelEfficiency || 0} km/L`} subtitle={`Total Fuel: ${data.analytics.totalFuelConsumed || 0}L`} icon="⛽" color="border-yellow-500/30" />
            <MetricBlock title="Operational Cost" value={`₹${(data.analytics.totalOperationalCost || 0).toLocaleString('en-IN')}`} subtitle={`Maintenance + Fuel`} icon="💸" color="border-rose-500/30" />
            <MetricBlock title="Vehicle ROI" value={`${data.analytics.vehicleROI || 0}%`} subtitle={`Net Revenue vs Asset Cost`} icon="💰" color="border-purple-500/30" />
          </div>

          {/* 4. Custom CSS Charts Section (Zero NPM Dependencies) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart A: Vehicle Status Distribution (Horizontal Bars) */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-3xl border border-slate-800 shadow-xl hover:border-slate-700 transition-colors">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-6">Fleet Status Distribution</h3>
              <div className="space-y-5">
                {data.charts.vehicleStatusDistribution.map((item, idx) => {
                  const max = Math.max(...data.charts.vehicleStatusDistribution.map(i => i.count), 1);
                  const percentage = (item.count / max) * 100;
                  const colors = { 'AVAILABLE': 'bg-emerald-500', 'ON_TRIP': 'bg-blue-500', 'IN_SHOP': 'bg-orange-500', 'RETIRED': 'bg-red-500' };
                  
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                        <span className="uppercase">{item.status}</span>
                        <span>{item.count} Vehicles</span>
                      </div>
                      <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden">
                        <div className={`h-full rounded-full ${colors[item.status] || 'bg-cyan-500'} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  )
                })}
                {data.charts.vehicleStatusDistribution.length === 0 && <p className="text-slate-500 text-xs italic">No vehicle data available.</p>}
              </div>
            </div>

            {/* Chart B: Monthly Financial Data (Vertical Bars) */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md p-6 rounded-3xl border border-slate-800 shadow-xl hover:border-slate-700 transition-colors flex flex-col">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-6">Financial Trends</h3>
              <div className="flex-grow flex items-end gap-3 h-48 mt-2">
                {data.charts.monthlyFinancialData.map((monthData, idx) => {
                  const maxVal = Math.max(...data.charts.monthlyFinancialData.map(m => Math.max(m.revenue, m.totalOperationalCost)), 1);
                  const revHeight = (monthData.revenue / maxVal) * 100;
                  const costHeight = (monthData.totalOperationalCost / maxVal) * 100;

                  return (
                    <div key={idx} className="flex-1 flex flex-col justify-end items-center gap-2 group h-full">
                      <div className="w-full flex justify-center gap-1 h-full items-end">
                        {/* Revenue Bar */}
                        <div className="w-full max-w-[12px] bg-emerald-500/80 rounded-t-md hover:bg-emerald-400 transition-all relative" style={{ height: `${revHeight}%` }}>
                          <span className="absolute -top-7 left-1/2 transform -translate-x-1/2 text-[10px] font-bold bg-slate-800 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">₹{monthData.revenue}</span>
                        </div>
                        {/* Cost Bar */}
                        <div className="w-full max-w-[12px] bg-rose-500/80 rounded-t-md hover:bg-rose-400 transition-all relative" style={{ height: `${costHeight}%` }}>
                          <span className="absolute -top-7 left-1/2 transform -translate-x-1/2 text-[10px] font-bold bg-slate-800 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">₹{monthData.totalOperationalCost}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold truncate w-full text-center">{monthData.month.split(' ')[0]}</span>
                    </div>
                  )
                })}
                {data.charts.monthlyFinancialData.length === 0 && <p className="text-slate-500 text-xs text-center w-full italic">No financial data available.</p>}
              </div>
              <div className="flex justify-center gap-6 mt-6 text-xs font-bold text-slate-400">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Revenue</span>
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span> Ops Cost</span>
              </div>
            </div>

          </div>

          {/* 5. Recent Dispatched Trips Table */}
          <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-800 bg-[#1e293b]/30">
              <h2 className="text-lg font-bold text-white">Live Dispatched Registry</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0b0f19] text-slate-400 text-xs font-bold tracking-wider uppercase border-b border-slate-800">
                    <th className="py-4 px-6">Tracking ID</th>
                    <th className="py-4 px-6">Route Matrix</th>
                    <th className="py-4 px-6">Driver & Asset</th>
                    <th className="py-4 px-6 text-right">Est. Revenue</th>
                    <th className="py-4 px-6 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.recentTrips.length > 0 ? (
                    data.recentTrips.map((trip, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors duration-200">
                        <td className="py-4 px-6 font-mono text-xs font-bold text-cyan-400">#{trip.id.substring(0,8).toUpperCase()}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                            <span>{trip.source}</span>
                            <span className="text-xs text-slate-600">➔</span>
                            <span>{trip.destination}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-sm font-semibold text-slate-200">{trip.driver?.name || "Pending Assignment"}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{trip.vehicle?.registrationNumber || "Asset TBD"}</p>
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-emerald-400">₹{trip.revenue || 0}</td>
                        <td className="py-4 px-6 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                            trip.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            trip.status === 'DISPATCHED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            trip.status === 'CANCELLED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              trip.status === 'COMPLETED' ? 'bg-emerald-400' :
                              trip.status === 'DISPATCHED' ? 'bg-blue-400' : 
                              trip.status === 'CANCELLED' ? 'bg-rose-400' : 'bg-slate-400'
                            }`}></span>
                            {trip.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-slate-500 text-sm font-medium">📭 No active operations matching current filters.</td>
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

// --- Sub-components for cleaner code ---

const KpiCard = ({ title, value, icon, color }) => (
  <div className="bg-[#1e293b]/50 backdrop-blur-md p-5 rounded-3xl border border-slate-700/50 hover:border-slate-600 transition-all shadow-lg group">
    <p className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-2">{title}</p>
    <div className="flex justify-between items-end">
      <h3 className={`text-3xl font-black ${color} tracking-tight`}>{value}</h3>
      <span className="text-2xl opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">{icon}</span>
    </div>
  </div>
);

const MetricBlock = ({ title, value, subtitle, icon, color }) => (
  <div className={`bg-[#0f172a]/50 backdrop-blur-md p-5 rounded-3xl border ${color} shadow-lg flex items-center justify-between`}>
    <div>
      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</h4>
      <div className="text-2xl font-black text-white">{value}</div>
      <p className="text-[10px] font-medium text-slate-500 mt-1">{subtitle}</p>
    </div>
    <div className="text-2xl bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800/80 shadow-inner">{icon}</div>
  </div>
);

export default Dashboard;