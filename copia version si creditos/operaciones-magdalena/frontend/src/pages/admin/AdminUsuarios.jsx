import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { usuariosService, authService } from '../../services/api';
import { ShieldCheck, UserPlus, Edit2, Trash2, Camera, Check, X, ShieldAlert, User as UserIcon } from 'lucide-react';
import useAlerta from '../../hooks/useAlerta';
import Alerta from '../../components/Alerta';

export default function AdminUsuarios() {
  const { token, user: activeUser } = useAuth();
  const { alerta, mostrarAlerta, cerrarAlerta } = useAlerta();
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
    nombre_completo: '', email: '', password: '', rol: 'repartidor', telefono: '', identificacion: ''
  });
  const [formLoading, setFormLoading] = useState(false);


  async function cargarUsuarios() {
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
    if (isVerified) cargarUsuarios(); 
  }, [isVerified]);

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
    setFormLoading(true);
    try {
      if (editMode) {
        await usuariosService.editar(token, selectedId, formData);
        mostrarAlerta('success', 'Usuario actualizado');
      } else {
        await usuariosService.crear(token, formData);
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
    setFormData({ nombre_completo: '', email: '', password: '', rol: 'repartidor', telefono: '', identificacion: '' });
    setEditMode(false);
    setSelectedId(null);
  }

  function openEdit(u) {
    setFormData({
      nombre_completo: u.nombre_completo,
      email: u.email,
      password: '****', // placeholder for visual
      rol: u.rol,
      telefono: u.telefono || '',
      identificacion: u.identificacion || ''
    });
    setSelectedId(u.id);
    setEditMode(true);
    setShowForm(true);
  }

  async function handleEliminar(id) {
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
    try {
      const res = await usuariosService.subirAvatar(token, id, file);
      mostrarAlerta('success', 'Avatar actualizado');
      cargarUsuarios();
    } catch (err) {
      mostrarAlerta('error', err.message);
    }
  }


  async function handleToggleEstado(id, activo) {
    try {
      await usuariosService.toggleEstado(token, id, !activo);
      cargarUsuarios();
    } catch (err) {
      alert('Error: ' + err.message);
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
            onClick={() => { if(showForm) resetForm(); setShowForm(!showForm); }}
            className={`px-4 py-2.5 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 ${showForm ? 'bg-gray-400' : 'bg-brand-primary hover:bg-brand-navy active:scale-95'}`}
          >
            {showForm ? <X size={18} /> : <UserPlus size={18} />}
            {showForm ? 'Cerrar' : 'Nuevo Usuario'}
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
            {/* Create/Edit form */}
            {showForm && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 animate-fade-in-down">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-title text-gray-900">{editMode ? 'Editar Usuario' : 'Crear Nuevo Usuario'}</h3>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 font-body">
                  <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl flex items-center gap-4 border border-gray-100 mb-2">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-inner border border-gray-200 text-gray-300 relative overflow-hidden group">
                      <UserIcon size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Identidad Visual</p>
                      <p className="text-sm text-gray-600">El avatar se sube después de crear el perfil.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Rol del Usuario</label>
                    <select
                      value={formData.rol}
                      disabled={editMode}
                      onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none font-semibold disabled:bg-gray-50"
                    >
                      <option value="repartidor">Repartidor (Conductor)</option>
                      <option value="empresa">Empresa Aliada</option>
                      <option value="admin">Administrador Corporativo</option>
                    </select>
                  </div>

                  {formData.rol === 'empresa' && !editMode && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre de Empresa</label>
                        <input
                          type="text" required
                          value={formData.nombre_empresa || ''}
                          onChange={(e) => setFormData({ ...formData, nombre_empresa: e.target.value })}
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                          placeholder="Ej: Transportes OLM"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">NIT</label>
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
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre Completo</label>
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
                      disabled={editMode}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-primary outline-none disabled:text-gray-400"
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

                  <div className="md:col-span-2 pt-6 flex justify-end gap-3">
                    <button
                      type="button" onClick={() => { setShowForm(false); resetForm(); }}
                      className="px-6 py-3 text-gray-500 font-bold hover:text-gray-700 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit" disabled={formLoading}
                      className="px-8 py-3 bg-brand-navy text-white font-bold rounded-xl shadow-lg shadow-brand-navy/20 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {formLoading ? 'Procesando...' : (editMode ? 'Guardar Cambios' : 'Crear Usuario')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Users list View */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Identidad</th>
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contacto</th>
                      <th className="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rol</th>
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
                                    <img src={u.avatar_url} alt={u.nombre_completo} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                                       <UserIcon size={20} />
                                    </div>
                                  )}
                               </div>
                               <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-primary text-white rounded-lg flex items-center justify-center cursor-pointer hover:bg-brand-navy shadow-md transition-all scale-0 group-hover:scale-100">
                                  <Camera size={12} />
                                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handleAvatar(u.id, e.target.files[0])} />
                               </label>
                             </div>
                             <div>
                               <p className="text-sm font-bold text-gray-900 leading-snug">{u.nombre_completo}</p>
                               <p className="text-[10px] text-gray-400 font-mono">{u.identificacion || 'S/I'}</p>
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600 font-medium">{u.email}</p>
                          <p className="text-[11px] text-brand-primary font-bold">{u.telefono || 'Sin tel.'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-tighter shadow-sm border ${rolBadge(u.rol)}`}>
                            {u.rol}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => handleToggleEstado(u.id, u.activo)}
                            disabled={u.email === 'admin@magdalenalogistica.com'}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all border shadow-sm ${u.activo ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100 opacity-60'}`}
                          >
                            {u.activo ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                            {u.activo ? 'ACTIVO' : 'INACTIVO'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => openEdit(u)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Editar datos"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleEliminar(u.id)}
                              disabled={u.email === 'admin@magdalenalogistica.com'}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-0"
                              title="Eliminar usuario"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {usuarios.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center">
                          <p className="text-gray-400 text-sm font-medium">No se encontraron usuarios registrados.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <Alerta {...alerta} onClose={cerrarAlerta} />
    </Layout>
  );
}
