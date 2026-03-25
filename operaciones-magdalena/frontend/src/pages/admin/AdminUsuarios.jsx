import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { usuariosService, authService } from '../../services/api';
import { ShieldCheck, UserPlus, Edit2, Trash2, Camera, Check, X, ShieldAlert, User as UserIcon, LogOut } from 'lucide-react';
import useAlerta from '../../hooks/useAlerta';
import Alerta from '../../components/Alerta';
import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_PERMISSION_LABELS,
  DEFAULT_ADMIN_PERMISSIONS,
  normalizeAdminPermissions,
} from '../../constants/permissions';

export default function AdminUsuarios() {
  const { token, user: activeUser, hasPermission, isPrincipalAdmin } = useAuth();
  const { alerta, mostrarAlerta, cerrarAlerta } = useAlerta();
  const canViewUsers = hasPermission('usuarios.view');
  const canCreateUsers = hasPermission('usuarios.create');
  const canEditUsers = hasPermission('usuarios.edit');
  const canDeleteUsers = hasPermission('usuarios.delete');
  const canManagePermissions = hasPermission('usuarios.permissions.manage');
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Security state
  const [isVerified, setIsVerified] = useState(false);
  const [verifyPass, setVerifyPass] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Form/Modal state
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false); // false=crear, true=editar
  const [selectedId, setSelectedId] = useState(null);
  
  const [formData, setFormData] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    rol: 'repartidor',
    telefono: '',
    identificacion: '',
    nombre_empresa: '',
    nit_empresa: '',
    avatarFile: null,
    es_principal: false,
    permisos: normalizeAdminPermissions(DEFAULT_ADMIN_PERMISSIONS),
  });
  const [formLoading, setFormLoading] = useState(false);


  async function cargarUsuarios() {
    if (!canViewUsers) return;
    try {
      setLoading(true);
      const data = await usuariosService.listar(token);
      setUsuarios(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    if (isVerified && canViewUsers) cargarUsuarios(); 
  }, [isVerified, canViewUsers]);

  async function handleVerify(e) {
    e.preventDefault();
    setVerifying(true);
    try {
      // Intentar login con el correo del admin actual + password ingresado
      await authService.login(activeUser.email, verifyPass);
      setIsVerified(true);
    } catch (err) {
      mostrarAlerta('error', 'Contraseña incorrecta');
    } finally {
      setVerifying(false);
    }
  }


  async function handleSubmit(e) {
    e.preventDefault();
    if (!editMode && !canCreateUsers) {
      mostrarAlerta('error', 'No tienes permiso para crear usuarios');
      return;
    }
    if (editMode && !canEditUsers) {
      mostrarAlerta('error', 'No tienes permiso para editar usuarios');
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        ...formData,
        avatarFile: undefined,
        permisos: formData.rol === 'admin'
          ? normalizeAdminPermissions(formData.permisos, Boolean(formData.es_principal))
          : {},
      };

      let usuarioCreadoId = null;
      if (editMode) {
        await usuariosService.editar(token, selectedId, payload);
        if (formData.avatarFile) {
          await usuariosService.subirAvatar(token, selectedId, formData.avatarFile);
        }
        mostrarAlerta('success', 'Usuario actualizado correctamente');
      } else {
        const created = await usuariosService.crear(token, payload);
        usuarioCreadoId = created?.id;
        if (formData.avatarFile && usuarioCreadoId) {
          await usuariosService.subirAvatar(token, usuarioCreadoId, formData.avatarFile);
        }
        mostrarAlerta('success', 'Usuario creado exitosamente');
      }
      setShowForm(false);
      resetForm();
      cargarUsuarios();
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setFormLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      nombre_completo: '',
      email: '',
      password: '',
      rol: 'repartidor',
      telefono: '',
      identificacion: '',
      nombre_empresa: '',
      nit_empresa: '',
      avatarFile: null,
      es_principal: false,
      permisos: normalizeAdminPermissions(DEFAULT_ADMIN_PERMISSIONS),
    });
    setEditMode(false);
    setSelectedId(null);
  }

  function openEdit(u) {
    if (!canEditUsers) {
      mostrarAlerta('error', 'No tienes permiso para editar usuarios');
      return;
    }

    setFormData({
      nombre_completo: u.nombre_completo,
      email: u.email,
      password: '****', // placeholder for visual
      rol: u.rol,
      telefono: u.telefono || '',
      identificacion: u.identificacion || '',
      nombre_empresa: u.empresa?.nombre || '',
      nit_empresa: u.empresa?.nit || '',
      avatarFile: null,
      es_principal: Boolean(u.es_principal),
      permisos: normalizeAdminPermissions(u.permisos || DEFAULT_ADMIN_PERMISSIONS, Boolean(u.es_principal)),
    });
    setSelectedId(u.id);
    setEditMode(true);
    setShowForm(true);
  }

  async function handleEliminar(id) {
    if (!canDeleteUsers) {
      mostrarAlerta('error', 'No tienes permiso para eliminar usuarios');
      return;
    }

    if (!window.confirm('¿Estás seguro de eliminar este usuario? Esta acción es irreversible.')) return;
    try {
      await usuariosService.eliminar(token, id);
      mostrarAlerta('success', 'Usuario eliminado');
      cargarUsuarios();
    } catch (err) {
      mostrarAlerta('error', err.message);
    }
  }

  async function handleAvatar(id, file) {
    if (!canEditUsers) {
      mostrarAlerta('error', 'No tienes permiso para editar usuarios');
      return;
    }

    try {
      const res = await usuariosService.subirAvatar(token, id, file);
      mostrarAlerta('success', 'Avatar actualizado');
      cargarUsuarios();
    } catch (err) {
      mostrarAlerta('error', err.message);
    }
  }

  function handleAvatarError(id) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, avatar_url: null } : u)));
  }

  function handleRolChange(nextRol) {
    setFormData((prev) => ({
      ...prev,
      rol: nextRol,
      es_principal: nextRol === 'admin' ? prev.es_principal : false,
      permisos: nextRol === 'admin'
        ? normalizeAdminPermissions(prev.permisos || DEFAULT_ADMIN_PERMISSIONS, Boolean(prev.es_principal))
        : {},
    }));
  }

  function togglePermiso(permiso) {
    setFormData((prev) => ({
      ...prev,
      permisos: {
        ...prev.permisos,
        [permiso]: !prev.permisos?.[permiso],
      },
    }));
  }


  async function handleToggleEstado(id, activo) {
    if (!canEditUsers) {
      mostrarAlerta('error', 'No tienes permiso para editar usuarios');
      return;
    }

    try {
      await usuariosService.toggleEstado(token, id, !activo);
      cargarUsuarios();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function handleCerrarSesionRemota(usuario) {
    if (!canEditUsers) {
      mostrarAlerta('error', 'No tienes permiso para editar usuarios');
      return;
    }

    if (usuario.rol !== 'repartidor') {
      mostrarAlerta('error', 'Solo se permite cierre remoto para repartidores');
      return;
    }

    const ok = window.confirm(`Se cerrara la sesion activa de ${usuario.nombre_completo}. Deseas continuar?`);
    if (!ok) return;

    try {
      await usuariosService.cerrarSesion(token, usuario.id);
      mostrarAlerta('success', `Sesion cerrada para ${usuario.nombre_completo}`);
      cargarUsuarios();
    } catch (err) {
      mostrarAlerta('error', err.message);
    }
  }

  const rolBadge = (rol) => {
    const colors = {
      admin: 'bg-purple-100 text-purple-700',
      empresa: 'bg-emerald-100 text-emerald-700',
      repartidor: 'bg-amber-100 text-amber-700',
    };
    return colors[rol] || 'bg-gray-100 text-gray-700';
  };

  const isUserOnline = (u) => Boolean(u.is_online);

  function formatLastActivity(lastActivityAt) {
    if (!lastActivityAt) return 'Sin actividad reciente';
    const ts = new Date(lastActivityAt).getTime();
    if (Number.isNaN(ts)) return 'Sin actividad reciente';

    const diffSec = Math.max(Math.floor((Date.now() - ts) / 1000), 0);
    if (diffSec < 60) return 'Hace unos segundos';
    if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `Hace ${Math.floor(diffSec / 3600)} h`;
    return `Hace ${Math.floor(diffSec / 86400)} d`;
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Action Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-title text-brand-dark">Gestión de Usuarios</h1>
            <p className="text-sm text-gray-500 font-body">Administra las cuentas de acceso al sistema OLM.</p>
          </div>
          <button
            disabled={!canCreateUsers && !showForm}
            onClick={() => { if(showForm) resetForm(); setShowForm(!showForm); }}
            className={`px-4 py-2.5 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${showForm ? 'bg-gray-400' : 'bg-brand-primary hover:bg-brand-navy active:scale-95'}`}
          >
            {showForm ? <X size={18} /> : <UserPlus size={18} />}
            {showForm ? 'Cerrar' : (canCreateUsers ? 'Nuevo Usuario' : 'Sin permiso para crear')}
          </button>
        </div>

        {/* Security Screen */}
        {!isVerified && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-10 max-w-sm mx-auto text-center mt-12 animate-fade-in">
             <div className="w-16 h-16 bg-brand-light/10 text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
                <ShieldCheck size={32} />
             </div>
             <h2 className="text-xl font-title text-gray-800 mb-2">Panel Protegido</h2>
             <p className="text-sm text-gray-500 mb-8 font-body">Por tu seguridad, introduce tu contraseña de administrador para continuar.</p>
             <form onSubmit={handleVerify} className="space-y-4">
                <input 
                  type="password" 
                  autoFocus
                  placeholder="Contraseña de admin" 
                  autoComplete="current-password"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-center"
                  value={verifyPass}
                  onChange={e => setVerifyPass(e.target.value)}
                />
                <button 
                  disabled={verifying || !verifyPass}
                  className="w-full py-3 bg-brand-navy text-white rounded-xl font-bold shadow-lg shadow-brand-navy/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {verifying ? 'Verificando...' : 'Desbloquear Panel'}
                </button>
             </form>
          </div>
        )}

        {isVerified && (
          <>
            {!canViewUsers && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl p-4 text-sm font-semibold">
                Tu usuario administrador no tiene habilitado el permiso para ver este modulo.
              </div>
            )}

            {/* Create/Edit form */}
            {showForm && canViewUsers && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 animate-fade-in-down">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-title text-gray-900">{editMode ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</h3>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 font-body">
                  <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl flex items-center gap-4 border border-gray-100 mb-2">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-inner border border-gray-200 text-gray-300 relative overflow-hidden group">
                      {formData.avatarFile ? (
                        <img src={URL.createObjectURL(formData.avatarFile)} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon size={24} />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Identidad Visual</p>
                      <p className="text-sm text-gray-600">Puedes subir el avatar directamente en este formulario.</p>
                    </div>
                    <label className="ml-auto px-3 py-2 text-xs font-bold rounded-lg bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 cursor-pointer">
                      Seleccionar foto
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setFormData({ ...formData, avatarFile: e.target.files?.[0] || null })}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Rol del Usuario</label>
                    <select
                      value={formData.rol}
                      disabled={editMode}
                      onChange={(e) => handleRolChange(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none font-semibold disabled:bg-gray-50"
                    >
                      <option value="repartidor">Repartidor (Conductor)</option>
                      <option value="empresa">Empresa Aliada</option>
                      <option value="admin">Administrador Corporativo</option>
                    </select>
                  </div>

                  {formData.rol === 'empresa' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre de la Empresa</label>
                        <input
                          type="text" required
                          value={formData.nombre_empresa || ''}
                          onChange={(e) => setFormData({ ...formData, nombre_empresa: e.target.value })}
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                          placeholder="Ej: Transportes OLM"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">NIT de la Empresa</label>
                        <input
                          type="text" required
                          value={formData.nit_empresa || ''}
                          onChange={(e) => setFormData({ ...formData, nit_empresa: e.target.value })}
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                          placeholder="900.123.456-1"
                        />
                      </div>
                    </>
                  )}

                  {formData.rol === 'repartidor' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Cédula / Identificación</label>
                      <input
                        type="text" required
                        value={formData.identificacion || ''}
                        onChange={(e) => setFormData({ ...formData, identificacion: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                        placeholder="1.082.000.000"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">{formData.rol === 'empresa' ? 'Nombre del Representante' : 'Nombre Completo'}</label>
                    <input
                      type="text" required
                      value={formData.nombre_completo}
                      onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                      placeholder="Nombre y Apellido"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Correo Electrónico</label>
                    <input
                      type="email" required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                      placeholder="usuario@peticion.com"
                    />
                  </div>

                  {!editMode && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Contraseña Inicial</label>
                      <input
                        type="password" required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                        placeholder="Asignar clave"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Teléfono Movil</label>
                    <input
                      type="text"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                      placeholder="300 000 0000"
                    />
                  </div>

                  {formData.rol === 'admin' && canManagePermissions && (
                    <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-3">Funciones desbloqueadas</h4>

                      {isPrincipalAdmin && (
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
                          <input
                            type="checkbox"
                            checked={Boolean(formData.es_principal)}
                            onChange={(e) => setFormData({ ...formData, es_principal: e.target.checked })}
                            className="rounded border-gray-300 text-brand-primary focus:ring-brand-light"
                          />
                          Marcar como administrador principal
                        </label>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {ADMIN_PERMISSION_KEYS.map((key) => (
                          <label key={key} className="flex items-center gap-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2">
                            <input
                              type="checkbox"
                              checked={Boolean(formData.permisos?.[key])}
                              onChange={() => togglePermiso(key)}
                              disabled={Boolean(formData.es_principal)}
                              className="rounded border-gray-300 text-brand-primary focus:ring-brand-light"
                            />
                            {ADMIN_PERMISSION_LABELS[key]}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2 pt-6 flex justify-end gap-3">
                    <button
                      type="button" onClick={() => { setShowForm(false); resetForm(); }}
                      className="px-6 py-3 text-gray-500 font-bold hover:text-gray-700 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit" disabled={formLoading || (!editMode && !canCreateUsers) || (editMode && !canEditUsers)}
                      className="px-8 py-3 bg-brand-navy text-white font-bold rounded-xl shadow-lg shadow-brand-navy/20 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {formLoading ? 'Procesando...' : (editMode ? 'Guardar Cambios' : 'Crear Usuario')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Users list View */}
            {canViewUsers && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Identidad</th>
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contacto</th>
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rol</th>
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Empresa</th>
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {usuarios.map((u) => (
                      <tr key={u.id} className="group hover:bg-gray-50/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                             <div className="relative">
                               <div className="w-12 h-12 rounded-2xl bg-gray-100 overflow-hidden shadow-inner border border-gray-100 transition-transform group-hover:scale-105">
                                  {u.avatar_url ? (
                                    <img src={u.avatar_url} alt={u.nombre_completo} className="w-full h-full object-cover" onError={() => handleAvatarError(u.id)} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                                       <UserIcon size={20} />
                                    </div>
                                  )}
                               </div>
                               {canEditUsers && (
                                 <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center cursor-pointer hover:bg-brand-navy shadow-md transition-all scale-0 group-hover:scale-100">
                                    <Camera size={12} />
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleAvatar(u.id, e.target.files[0])} />
                                 </label>
                               )}
                             </div>
                             <div>
                               <p className="text-sm font-bold text-gray-900 leading-snug">{u.nombre_completo}</p>
                               {u.rol === 'empresa' && u.empresa?.nombre && (
                                 <p className="text-[11px] text-emerald-700 font-semibold">{u.empresa.nombre}</p>
                               )}
                               <p className="text-[10px] text-gray-400 font-mono">{u.identificacion || 'S/I'}</p>
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600 font-medium">{u.email}</p>
                          <p className="text-[11px] text-brand-primary font-bold">{u.telefono || 'Sin tel.'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-tighter shadow-sm border ${rolBadge(u.rol)}`}>
                              {u.rol}
                            </span>
                            {u.rol === 'admin' && u.es_principal && (
                              <span className="inline-flex px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-tighter shadow-sm border bg-slate-100 text-slate-700 border-slate-200">
                                principal
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {u.rol === 'empresa' ? (
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{u.empresa?.nombre || 'Sin empresa'}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{u.empresa_id || 'Sin ID'}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1.5">
                            <button 
                              onClick={() => handleToggleEstado(u.id, u.activo)}
                              disabled={u.email === 'admin@magdalenalogistica.com' || !canEditUsers}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all border shadow-sm ${u.activo ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100 opacity-60'}`}
                            >
                              {u.activo ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                              {u.activo ? 'ACTIVO' : 'INACTIVO'}
                            </button>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isUserOnline(u) ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isUserOnline(u) ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                              {isUserOnline(u) ? 'EN LINEA' : 'FUERA DE LINEA'}
                            </span>
                            <p className="text-[10px] text-slate-400 font-semibold">{formatLastActivity(u.last_activity_at)}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEditUsers && (
                              <button 
                                onClick={() => openEdit(u)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                title="Editar datos"
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {canDeleteUsers && (
                              <button 
                                onClick={() => handleEliminar(u.id)}
                                disabled={u.email === 'admin@magdalenalogistica.com'}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-0"
                                title="Eliminar usuario"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            {canEditUsers && u.rol === 'repartidor' && (
                              <button
                                onClick={() => handleCerrarSesionRemota(u)}
                                className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                                title="Cerrar sesion remota"
                              >
                                <LogOut size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {usuarios.length === 0 && (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center">
                          <p className="text-gray-400 text-sm font-medium">No se encontraron usuarios registrados.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </>
        )}
      </div>

      <Alerta {...alerta} onClose={cerrarAlerta} />
    </Layout>
  );
}
