'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Service } from '@/lib/types';
import {
  Plus, Edit2, Trash2, Power, PowerOff, X, Loader2,
  AlertTriangle, CheckCircle, Wrench, Users, AlertCircle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function ServiceFormModal({
  service,
  onClose,
  onSaved,
}: {
  service?: Service | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(service);
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Service name is required'); return; }

    setSaving(true); setError(null);
    try {
      const auth = await getAuthHeader();
      const url = isEdit ? `/api/services/${service!.id}` : '/api/services';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ name: trimmedName, description: description.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed to save service'); return; }
      onSaved();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-2xl p-6 w-full max-w-md relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-100 cursor-pointer">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-950/50 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-100">{isEdit ? 'Edit Service' : 'Add New Service'}</h2>
            <p className="text-xs text-slate-500">Fill in service details below</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />{error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-1.5">Service Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="e.g. Water Distribution"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900/60 border border-slate-850 focus:border-indigo-500/50 text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of this service..."
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900/60 border border-slate-850 focus:border-indigo-500/50 text-slate-100 placeholder-slate-500 text-sm focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold transition-all cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Service'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-sm font-semibold hover:text-slate-100 transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Confirm Disable Modal ────────────────────────────────────────────────────
function ConfirmDisableModal({
  service,
  onClose,
  onConfirm,
}: {
  service: Service;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card rounded-2xl p-6 w-full max-w-sm relative border border-yellow-500/20">
        <div className="flex items-center gap-3 mb-4 text-yellow-400">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <h2 className="text-base font-extrabold">Disable Service?</h2>
            <p className="text-xs text-slate-400 mt-0.5">{service.name}</p>
          </div>
        </div>
        <p className="text-sm text-slate-400 mb-5">
          Disabling this service will hide it from assignment dropdowns. Existing assignments will
          remain intact but cannot receive new ones.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handle}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-950/40 border border-yellow-500/30 text-yellow-400 text-sm font-bold hover:bg-yellow-950/60 transition-all cursor-pointer disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />}
            {loading ? 'Disabling...' : 'Disable'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-sm font-semibold hover:text-slate-100 transition-all cursor-pointer">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
function ConfirmDeleteModal({
  service,
  onClose,
  onConfirm,
}: {
  service: Service;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card rounded-2xl p-6 w-full max-w-sm relative border border-red-500/20">
        <div className="flex items-center gap-3 mb-4 text-red-400">
          <Trash2 className="w-6 h-6 shrink-0" />
          <div>
            <h2 className="text-base font-extrabold">Delete Service?</h2>
            <p className="text-xs text-slate-400 mt-0.5">{service.name}</p>
          </div>
        </div>
        <p className="text-sm text-slate-400 mb-5">
          This will permanently delete the service. This action cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handle}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-950/60 transition-all cursor-pointer disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {loading ? 'Deleting...' : 'Delete'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/40 text-slate-400 text-sm font-semibold hover:text-slate-100 transition-all cursor-pointer">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [disableService, setDisableService] = useState<Service | null>(null);
  const [deleteService, setDeleteService] = useState<Service | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data: services = [], isLoading, refetch } = useQuery<Service[]>({
    queryKey: ['services-management'],
    queryFn: async () => {
      const res = await fetch('/api/services');
      if (!res.ok) throw new Error('Failed to fetch services');
      const d = await res.json();
      return d.services ?? [];
    },
  });

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('services_management_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
        queryClient.invalidateQueries({ queryKey: ['services-management'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['services-management'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // ── Toggle active ──────────────────────────────────────────────────────────
  const handleToggleActive = async (svc: Service) => {
    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/services/${svc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ is_active: !svc.is_active }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || 'Failed to update service', 'error'); return; }
      queryClient.invalidateQueries({ queryKey: ['services-management'] });
      queryClient.invalidateQueries({ queryKey: ['services-list'] });
      showToast(`Service ${svc.is_active ? 'disabled' : 'enabled'} successfully`);
    } catch {
      showToast('Network error', 'error');
    } finally {
      setDisableService(null);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (svc: Service) => {
    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/services/${svc.id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      const d = await res.json();
      if (!res.ok) {
        showToast(d.error || 'Failed to delete service', 'error');
        setDeleteService(null);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['services-management'] });
      queryClient.invalidateQueries({ queryKey: ['services-list'] });
      showToast('Service deleted successfully');
    } catch {
      showToast('Network error', 'error');
    } finally {
      setDeleteService(null);
    }
  };

  const handleSaved = () => {
    setAddOpen(false);
    setEditService(null);
    queryClient.invalidateQueries({ queryKey: ['services-management'] });
    queryClient.invalidateQueries({ queryKey: ['services-list'] });
    showToast('Service saved successfully');
  };

  const activeServices = services.filter((s) => s.is_active);
  const inactiveServices = services.filter((s) => !s.is_active);
  const totalVolunteers = services.reduce((acc, s) => acc + (s.assigned_count ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-indigo-400" /> Services Management
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Create and manage operational service categories for volunteers
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-100 text-sm font-semibold transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold transition-all cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:shadow-[0_0_25px_rgba(99,102,241,0.35)]"
          >
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Services', value: services.length, color: 'text-indigo-400' },
          { label: 'Active', value: activeServices.length, color: 'text-green-400' },
          { label: 'Disabled', value: inactiveServices.length, color: 'text-yellow-400' },
          { label: 'Assigned Volunteers', value: totalVolunteers, color: 'text-purple-400' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl p-4">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Services Table */}
      {isLoading ? (
        <div className="glass-card rounded-2xl p-12 flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span className="text-sm font-semibold">Loading services...</span>
        </div>
      ) : services.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Wrench className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-semibold">No services found</p>
          <p className="text-slate-500 text-xs mt-1">Create your first service to get started.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950/95 backdrop-blur-sm">
                <tr className="border-b border-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-5 py-4">Service Name</th>
                  <th className="px-5 py-4">Description</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Volunteers Assigned</th>
                  <th className="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
                {services.map((svc) => (
                  <tr key={svc.id} className={`hover:bg-slate-900/40 transition-colors ${!svc.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-100">{svc.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(svc.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-5 py-4 max-w-[200px]">
                      <span className="text-slate-400 text-xs line-clamp-2">
                        {svc.description || <span className="text-slate-600 italic">No description</span>}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {svc.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-950/40 text-green-400 border border-green-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#22c55e]" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-yellow-950/40 text-yellow-400 border border-yellow-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-purple-400 shrink-0" />
                        <span className="font-bold text-slate-100">{svc.assigned_count ?? 0}</span>
                        <span className="text-slate-500 text-xs">volunteer{(svc.assigned_count ?? 0) !== 1 ? 's' : ''}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {/* Edit */}
                        <button
                          onClick={() => setEditService(svc)}
                          title="Edit Service"
                          className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-100 hover:border-indigo-500/40 transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Toggle Enable/Disable */}
                        {svc.is_active ? (
                          <button
                            onClick={() => setDisableService(svc)}
                            title="Disable Service"
                            className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-yellow-400 hover:text-yellow-300 hover:border-yellow-500/40 transition-all cursor-pointer"
                          >
                            <PowerOff className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleActive(svc)}
                            title="Enable Service"
                            className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-green-400 hover:text-green-300 hover:border-green-500/40 transition-all cursor-pointer"
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete (only if no assignments) */}
                        {(svc.assigned_count ?? 0) === 0 ? (
                          <button
                            onClick={() => setDeleteService(svc)}
                            title="Delete Service"
                            className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-red-400 hover:text-red-300 hover:border-red-500/40 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            disabled
                            title="Cannot delete — volunteers assigned"
                            className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-600 cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {addOpen && (
          <ServiceFormModal onClose={() => setAddOpen(false)} onSaved={handleSaved} />
        )}
        {editService && (
          <ServiceFormModal service={editService} onClose={() => setEditService(null)} onSaved={handleSaved} />
        )}
        {disableService && (
          <ConfirmDisableModal
            service={disableService}
            onClose={() => setDisableService(null)}
            onConfirm={() => handleToggleActive(disableService)}
          />
        )}
        {deleteService && (
          <ConfirmDeleteModal
            service={deleteService}
            onClose={() => setDeleteService(null)}
            onConfirm={() => handleDelete(deleteService)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold shadow-2xl ${
              toast.type === 'error'
                ? 'bg-red-950/80 border-red-500/40 text-red-300'
                : 'bg-green-950/80 border-green-500/40 text-green-300'
            }`}
          >
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
