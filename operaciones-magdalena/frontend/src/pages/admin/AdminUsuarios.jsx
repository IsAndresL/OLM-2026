import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { usuariosService } from '../../services/api';

export default function AdminUsuarios() {
  const { token } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nombre_completo: '', email: '', password: '', rol: 'repartidor', telefono: ''
  });
  const [formError, setFormError] = useState('');
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

  useEffect(() => { cargarUsuarios(); }, []);

  async function handleCrear(e) {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      await usuariosService.crear(token, formData);
      setShowForm(false);
      setFormData({ nombre_completo: '', email: '', password: '', rol: 'repartidor', telefono: '' });
      cargarUsuarios();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
            <p className="text-sm text-gray-500 mt-1">Gestiona los usuarios del sistema</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-colors duration-150 hover:opacity-90"
            style={{ backgroundColor: '#1D4ED8' }}
          >
            {showForm ? 'Cancelar' : '+ Nuevo usuario'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Crear nuevo usuario</h3>
            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{formError}</p>
              </div>
            )}
            <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text" required
                  value={formData.nombre_completo}
                  onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email" required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password" required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={formData.rol}
                  onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="repartidor">Repartidor</option>
                  <option value="empresa">Empresa</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="3001234567"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit" disabled={formLoading}
                  className="px-6 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-150 hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#1D4ED8' }}
                >
                  {formLoading ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Cargando usuarios...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-500">{error}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{u.nombre_completo}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{u.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${rolBadge(u.rol)}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggleEstado(u.id, u.activo)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${u.activo ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-400">
                      No hay usuarios registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
