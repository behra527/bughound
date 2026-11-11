import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './context'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import CustomerDashboard from './pages/customer/Dashboard'
import CreateTicket from './pages/customer/CreateTicket'
import MyTickets from './pages/customer/MyTickets'
import TicketDetails from './pages/customer/TicketDetails'
import Profile from './pages/customer/Profile'
import AdminDashboard from './pages/admin/Dashboard'
import AdminTickets from './pages/admin/Tickets'
import WorkflowDataView from './pages/admin/WorkflowDataView'
import PatchApproval from './pages/admin/PatchApproval'
import Settings from './pages/admin/Settings'
import Reports from './pages/admin/Reports'

function Guard({ role, children }) {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/customer'} replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/customer" element={<Guard role="customer"><CustomerDashboard /></Guard>} />
      <Route path="/customer/create" element={<Guard role="customer"><CreateTicket /></Guard>} />
      <Route path="/customer/tickets" element={<Guard role="customer"><MyTickets /></Guard>} />
      <Route path="/customer/tickets/:id" element={<Guard role="customer"><TicketDetails /></Guard>} />
      <Route path="/customer/profile" element={<Guard role="customer"><Profile /></Guard>} />
      <Route path="/admin" element={<Guard role="admin"><AdminDashboard /></Guard>} />
      <Route path="/admin/tickets" element={<Guard role="admin"><AdminTickets /></Guard>} />
      <Route path="/admin/tickets/:id" element={<Guard role="admin"><WorkflowDataView view="investigation" /></Guard>} />
      <Route path="/admin/agents" element={<Guard role="admin"><WorkflowDataView view="agents" /></Guard>} />
      <Route path="/admin/repositories" element={<Guard role="admin"><WorkflowDataView view="repository" /></Guard>} />
      <Route path="/admin/validation" element={<Guard role="admin"><WorkflowDataView view="validation" /></Guard>} />
      <Route path="/admin/diff" element={<Guard role="admin"><WorkflowDataView view="patch" /></Guard>} />
      <Route path="/admin/testing" element={<Guard role="admin"><WorkflowDataView view="testing" /></Guard>} />
      <Route path="/admin/github" element={<Guard role="admin"><PatchApproval /></Guard>} />
      <Route path="/admin/customers" element={<Guard role="admin"><Settings /></Guard>} />
      <Route path="/admin/settings" element={<Guard role="admin"><Settings /></Guard>} />
      <Route path="/admin/reports" element={<Guard role="admin"><Reports /></Guard>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
