import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiRequest, getAccessToken, setAccessToken, toUiTicket } from './api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('bughound-user')
    return getAccessToken() && raw ? JSON.parse(raw) : null
  })
  const [tickets, setTickets] = useState([])
  const [ticketsLoaded, setTicketsLoaded] = useState(false)
  const [profile, setProfile] = useState(null)
  const [people, setPeople] = useState([])
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (user && !profile) {
      setProfile({ name: user.name, email: user.email, phone: '', org: user.company || '', bio: '', created: '', status: 'Active', role: user.role })
    }
  }, [user, profile])

  const notify = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 2400)
  }

  const login = async (email, password) => {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setAccessToken(result.access_token)
    localStorage.setItem('bughound-user', JSON.stringify(result.user))
    setUser(result.user)
    setProfile({ name: result.user.name, email: result.user.email, phone: '', org: result.user.company || '', bio: '', created: '', status: 'Active', role: result.user.role })
    return result.user
  }

  const logout = () => {
    setAccessToken(null)
    localStorage.removeItem('bughound-user')
    setUser(null)
      setProfile(null)
    setTickets([])
    setTicketsLoaded(false)
  }

  const refreshTickets = async () => {
    const result = await apiRequest('/tickets')
    const next = result.map(toUiTicket)
    setTickets(next)
    setTicketsLoaded(true)
    return next
  }

  const addTicket = async (ticket) => {
    const result = await apiRequest('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: ticket.title,
        description: ticket.description,
        steps_to_reproduce: ticket.steps,
      }),
    })
    const next = toUiTicket(result)
    setTickets((list) => [next, ...list])
    notify(`Ticket ${next.id} submitted`)
    return next
  }

  const connectRepositoryAndStart = async (id, repositoryUrl) => {
    const result = await apiRequest(`/admin/tickets/${id}/repository`, {
      method: 'POST',
      body: JSON.stringify({ repository_url: repositoryUrl }),
    })
    const next = toUiTicket(result)
    setTickets((list) => list.map((item) => item.apiId === id ? next : item))
    return next
  }

  const approveTicket = async (id) => {
    const result = await apiRequest(`/admin/tickets/${id}/approve`, { method: 'POST' })
    const next = toUiTicket(result)
    setTickets((list) => list.map((item) => item.apiId === id ? next : item))
    return next
  }

  const rejectTicket = async (id) => {
    const result = await apiRequest(`/admin/tickets/${id}/reject`, { method: 'POST' })
    const next = toUiTicket(result)
    setTickets((list) => list.map((item) => item.apiId === id ? next : item))
    return next
  }

  const createCustomer = async (customer) => {
    const result = await apiRequest('/admin/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    })
    const next = {
      id: result.id,
      initials: result.name.slice(0, 2).toUpperCase(),
      name: result.name,
      email: result.email,
      company: result.company || customer.company || '—',
      projects: 0,
      tickets: 0,
      joined: new Date().toLocaleDateString(),
      status: 'Active',
    }
    setPeople((list) => [next, ...list])
    return next
  }

  const refreshCustomers = async () => {
    const result = await apiRequest('/admin/customers')
    setPeople(result)
    return result
  }

  const updateProfile = async (nextProfile) => {
    const result = await apiRequest('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: nextProfile.name, company: nextProfile.org || '' }),
    })
    const nextUser = { ...user, ...result }
    setUser(nextUser)
    localStorage.setItem('bughound-user', JSON.stringify(nextUser))
    setProfile({ ...nextProfile, name: result.name, email: result.email, org: result.company })
    return result
  }

  const changePassword = (currentPassword, newPassword) => apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })

  useEffect(() => {
    if (!user) return
    refreshTickets().catch((error) => notify(error.message))
  }, [user?.id])

  useEffect(() => {
    if (user?.role !== 'admin') return
    refreshCustomers().catch((error) => notify(error.message))
  }, [user?.id, user?.role])

  const value = useMemo(() => ({
    user, login, logout, tickets, ticketsLoaded, addTicket, refreshTickets, connectRepositoryAndStart, approveTicket, rejectTicket,
    profile, setProfile, updateProfile, changePassword, people, setPeople, createCustomer, refreshCustomers, notify, toast,
  }), [user, tickets, profile, people, toast])

  return (
    <AppContext.Provider value={value}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
