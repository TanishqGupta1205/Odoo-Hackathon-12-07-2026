import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { LayoutDashboard, Truck, Users, MapPin } from 'lucide-react';

// 1. Import your active pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Dashboard2 from './pages/Dashboard2';
// 2. Temporary placeholder components for the remaining features
const Vehicles = () => <div className="p-8"><h2 className="text-3xl font-bold text-slate-800">Vehicle Registry</h2></div>;
const Drivers = () => <div className="p-8"><h2 className="text-3xl font-bold text-slate-800">Driver Management</h2></div>;
const Trips = () => <div className="p-8"><h2 className="text-3xl font-bold text-slate-800">Trip Management</h2></div>;

// 3. Layout component that holds the Sidebar (only shows after login)
const MainLayout = ({ children }) => {
  const [currentRole, setCurrentRole] = useState('Fleet Manager');

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden w-full">
      {/* SIDEBAR */}
      <div className="w-64 bg-slate-900 text-white flex flex-col justify-between">
        <div className="p-5">
          <div className="flex items-center space-x-2 mb-6">
            <Truck className="text-blue-500 h-8 w-8" />
            <h1 className="text-xl font-bold tracking-wider text-white">TransitOps</h1>
          </div>
          
          <div className="bg-slate-800 p-3 rounded-lg mb-6">
            <p className="text-xs text-slate-400">Current Role:</p>
            <p className="text-sm text-yellow-400 font-semibold">{currentRole}</p>
          </div>

          <nav className="space-y-2">
            <Link to="/" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition text-slate-300 hover:text-white">
              <LayoutDashboard size={20} /> <span>Dashboard</span>
            </Link>
            <Link to="/vehicles" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition text-slate-300 hover:text-white">
              <Truck size={20} /> <span>Vehicles</span>
            </Link>
            <Link to="/drivers" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition text-slate-300 hover:text-white">
              <Users size={20} /> <span>Drivers</span>
            </Link>
            <Link to="/trips" className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition text-slate-300 hover:text-white">
              <MapPin size={20} /> <span>Trips</span>
            </Link>
          </nav>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

// 4. Main App Routing
// 4. Main App Routing
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTE */}
        <Route path="/login" element={<Login />} />

        {/* PROTECTED ROUTES (All wrapped in MainLayout) */}
        <Route path="/" element={<MainLayout><Dashboard /></MainLayout>} />
        <Route path="/dashboard" element={<MainLayout><Dashboard /></MainLayout>} />
        <Route path="/dashboard2" element={<MainLayout><Dashboard2 /></MainLayout>} />
        
        <Route path="/vehicles" element={<MainLayout><Vehicles /></MainLayout>} />
        <Route path="/drivers" element={<MainLayout><Drivers /></MainLayout>} />
        <Route path="/trips" element={<MainLayout><Trips /></MainLayout>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;