import React, { useState, useEffect } from 'react';
import {
  Globe,
  Building,
  Map,
  MapPin,
  Search,
  Plus,
  MoreVertical,
  Trash2,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function LocationManagementView({ activeSubTab = 'provinces', onTabChange = () => {} }) {
  const { hasPermission } = useAuth();

  // Active Tab: 'provinces' | 'cities' | 'areas' | 'sites'
  const [currentTab, setCurrentTab] = useState(activeSubTab || 'provinces');

  // Sync with prop when sidebar changes subtab
  useEffect(() => {
    if (activeSubTab && activeSubTab !== currentTab) {
      setCurrentTab(activeSubTab);
    }
  }, [activeSubTab]);

  const switchTab = (tabId) => {
    setCurrentTab(tabId);
    onTabChange(tabId);
    setSearchQuery('');
    setFilterProvince('');
    setFilterCity('');
    setFilterArea('');
    setPage(1);
  };

  // Location Data
  const [locationsSummary, setLocationsSummary] = useState({
    provinces: [],
    cities: [],
    areas: [],
    sites: []
  });
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterArea, setFilterArea] = useState('');

  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [modalProvinceId, setModalProvinceId] = useState('');
  const [modalCityId, setModalCityId] = useState('');
  const [modalAreaId, setModalAreaId] = useState('');
  const [isCustomEntry, setIsCustomEntry] = useState(false);
  const [masterProvinces, setMasterProvinces] = useState([]);
  const [masterCities, setMasterCities] = useState([]);
  const [masterAreas, setMasterAreas] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState(null);

  // Fetch Master Provinces from Pakistan JSON when modal opens
  useEffect(() => {
    if (isAddModalOpen && masterProvinces.length === 0) {
      api.get('/api/locations/master/provinces')
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setMasterProvinces(Array.isArray(data) ? data : []))
        .catch((err) => console.error('Failed to load master provinces:', err));
    }
  }, [isAddModalOpen]);

  // Fetch Master Cities when modalProvinceId changes in Cities or Areas tab
  useEffect(() => {
    if (!modalProvinceId) {
      setMasterCities([]);
      return;
    }
    const prov = (locationsSummary.provinces || []).find((p) => String(p.id) === String(modalProvinceId));
    if (prov) {
      api.get(`/api/locations/master/cities?province=${encodeURIComponent(prov.name)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setMasterCities(Array.isArray(data) ? data : []))
        .catch((err) => console.error('Failed to load master cities:', err));
    }
  }, [modalProvinceId]);

  // Fetch Master Areas when modalCityId changes in Areas tab
  useEffect(() => {
    if (!modalCityId) {
      setMasterAreas([]);
      return;
    }
    const prov = (locationsSummary.provinces || []).find((p) => String(p.id) === String(modalProvinceId));
    const cty = (locationsSummary.cities || []).find((c) => String(c.id) === String(modalCityId));
    if (prov && cty) {
      api.get(`/api/locations/master/areas?province=${encodeURIComponent(prov.name)}&city=${encodeURIComponent(cty.name)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setMasterAreas(Array.isArray(data) ? data : []))
        .catch((err) => console.error('Failed to load master areas:', err));
    }
  }, [modalCityId, modalProvinceId]);

  // Reset modal fields on open/close
  const handleOpenAddModal = () => {
    setAddName('');
    setModalProvinceId('');
    setModalCityId('');
    setModalAreaId('');
    setIsCustomEntry(false);
    setAddError(null);
    setIsAddModalOpen(true);
  };

  // 3-dots action dropdown
  const [openActionId, setOpenActionId] = useState(null);

  // Close actions dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.action-dropdown-wrapper') && !e.target.closest('.image-dots-btn')) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  const fetchLocations = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/api/locations/summary');
      if (res.ok) {
        const data = await res.json();
        setLocationsSummary(data);
      }
    } catch (err) {
      console.error('Failed to load locations summary:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  // Filter current active dataset
  const getFilteredItems = () => {
    const q = searchQuery.toLowerCase().trim();

    if (currentTab === 'provinces') {
      return (locationsSummary.provinces || []).filter((item) =>
        !q || item.name.toLowerCase().includes(q)
      );
    }

    if (currentTab === 'cities') {
      return (locationsSummary.cities || []).filter((item) => {
        if (q && !item.name.toLowerCase().includes(q)) return false;
        if (filterProvince && item.province_name !== filterProvince) return false;
        return true;
      });
    }

    if (currentTab === 'areas') {
      return (locationsSummary.areas || []).filter((item) => {
        if (q && !item.name.toLowerCase().includes(q)) return false;
        if (filterProvince && item.province_name !== filterProvince) return false;
        if (filterCity && item.city_name !== filterCity) return false;
        return true;
      });
    }

    if (currentTab === 'sites') {
      return (locationsSummary.sites || []).filter((item) => {
        if (q && !item.name.toLowerCase().includes(q)) return false;
        if (filterProvince && item.province_name !== filterProvince) return false;
        if (filterCity && item.city_name !== filterCity) return false;
        if (filterArea && item.area_name !== filterArea) return false;
        return true;
      });
    }

    return [];
  };

  const filteredItems = getFilteredItems();
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const paginatedItems = filteredItems.slice((validPage - 1) * pageSize, validPage * pageSize);

  // Create location node
  const handleCreateLocation = async (e) => {
    e.preventDefault();
    if (!addName.trim()) return;

    let targetType = 'province';
    let parentId = null;

    if (currentTab === 'cities') {
      targetType = 'city';
      if (!modalProvinceId) {
        setAddError('Please select a parent province');
        return;
      }
      parentId = parseInt(modalProvinceId, 10);
    } else if (currentTab === 'areas') {
      targetType = 'area';
      if (!modalCityId) {
        setAddError('Please select a parent city');
        return;
      }
      parentId = parseInt(modalCityId, 10);
    } else if (currentTab === 'sites') {
      targetType = 'site';
      if (!modalAreaId) {
        setAddError('Please select a parent area');
        return;
      }
      parentId = parseInt(modalAreaId, 10);
    }

    setIsSubmitting(true);
    setAddError(null);

    try {
      const res = await api.post('/api/locations/create', {
        name: addName.trim(),
        type: targetType,
        parent_id: parentId
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to create location');
      }

      await fetchLocations();
      setIsAddModalOpen(false);
      setAddName('');
      setModalProvinceId('');
      setModalCityId('');
      setModalAreaId('');
      setIsCustomEntry(false);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete location node
  const handleDeleteLocation = async (id, name, e) => {
    e.stopPropagation();
    setOpenActionId(null);
    if (!window.confirm(`Are you sure you want to delete '${name}' and all its child locations?`)) return;

    try {
      const res = await api.delete(`/api/locations/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to delete location');
      }
      await fetchLocations();
    } catch (err) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (!e.target.closest('.action-dots-cell')) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  return (
    <div className="locations-view-container">
      {/* Toolbar matching Images 3, 4, 5 */}
      <div className="image-toolbar-row">
        <div className="image-toolbar-left">
          {/* Search Input */}
          <div className="image-search-input-wrapper">
            <Search size={16} className="image-search-icon" />
            <input
              type="text"
              className="image-search-input"
              placeholder={
                currentTab === 'provinces'
                  ? 'Search provinces...'
                  : currentTab === 'cities'
                  ? 'Search cities...'
                  : currentTab === 'areas'
                  ? 'Search areas...'
                  : 'Search sites...'
              }
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Provinces filter (shown in Cities, Areas, Sites) */}
          {['cities', 'areas', 'sites'].includes(currentTab) && (
            <select
              className="image-select-filter"
              value={filterProvince}
              onChange={(e) => {
                setFilterProvince(e.target.value);
                setFilterCity('');
                setFilterArea('');
                setPage(1);
              }}
              title="Filter by Province"
            >
              <option value="">All Provinces</option>
              {(locationsSummary.provinces || []).map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Cities filter (shown in Areas, Sites) - Disabled until Province selected */}
          {['areas', 'sites'].includes(currentTab) && (
            <select
              className="image-select-filter"
              value={filterCity}
              disabled={!filterProvince}
              onChange={(e) => {
                setFilterCity(e.target.value);
                setFilterArea('');
                setPage(1);
              }}
              style={{
                opacity: !filterProvince ? 0.6 : 1,
                cursor: !filterProvince ? 'not-allowed' : 'pointer'
              }}
              title={!filterProvince ? 'Select Province first to unlock cities' : 'Filter by City'}
            >
              <option value="">
                {!filterProvince ? '— Select Province First —' : 'All Cities'}
              </option>
              {(locationsSummary.cities || [])
                .filter((c) => !filterProvince || c.province_name === filterProvince)
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          )}

          {/* Areas filter (shown in Sites) - Disabled until City selected */}
          {currentTab === 'sites' && (
            <select
              className="image-select-filter"
              value={filterArea}
              disabled={!filterCity}
              onChange={(e) => {
                setFilterArea(e.target.value);
                setPage(1);
              }}
              style={{
                opacity: !filterCity ? 0.6 : 1,
                cursor: !filterCity ? 'not-allowed' : 'pointer'
              }}
              title={!filterCity ? 'Select City first to unlock areas' : 'Filter by Area'}
            >
              <option value="">
                {!filterCity ? '— Select City First —' : 'All Areas'}
              </option>
              {(locationsSummary.areas || [])
                .filter((a) => !filterCity || a.city_name === filterCity)
                .map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
            </select>
          )}
        </div>

        {/* Add Button matching Images 3, 4, 5 */}
        <div className="image-toolbar-right">
          {hasPermission('LOCATION_CREATE') && (
            <button
              type="button"
              className="image-add-btn"
              onClick={handleOpenAddModal}
            >
              <Plus size={16} strokeWidth={2.4} />
              <span>
                {currentTab === 'provinces'
                  ? 'Add Province'
                  : currentTab === 'cities'
                  ? 'Add City'
                  : currentTab === 'areas'
                  ? 'Add Area'
                  : 'Add Site'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Table Container matching Images 3, 4, 5 */}
      <div className="image-card-table-wrapper">
        {/* =========================================================================
            PROVINCES TABLE (IMAGE 3)
           ========================================================================= */}
        {currentTab === 'provinces' && (
          <table className="image-data-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>PROVINCE NAME</th>
                <th style={{ width: '20%' }}>CITIES COUNT</th>
                <th style={{ width: '20%' }}>AREAS COUNT</th>
                <th style={{ width: '15%' }}>SITES COUNT</th>
                <th style={{ width: '5%', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    Loading provinces...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                    No provinces found. Click "+ Add Province" to create one.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((prov) => (
                  <tr key={prov.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={16} color="#059669" />
                        <strong className="image-item-name">{prov.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="image-count-badge">{prov.cities_count} Cities</span>
                    </td>
                    <td>
                      <span className="image-count-badge">{prov.areas_count} Areas</span>
                    </td>
                    <td>
                      <span className="image-count-badge">{prov.sites_count} Sites</span>
                    </td>
                    <td style={{ textAlign: 'center', width: '48px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <div className="action-dropdown-wrapper">
                        <button
                          type="button"
                          className="action-dots-btn"
                          onClick={() => setOpenActionId(openActionId === prov.id ? null : prov.id)}
                          title="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openActionId === prov.id && (
                          <div className="action-menu-dropdown right-aligned">
                            {hasPermission('LOCATION_DELETE') && (
                              <button
                                type="button"
                                className="action-menu-item danger"
                                onClick={(e) => handleDeleteLocation(prov.id, prov.name, e)}
                              >
                                <Trash2 size={13} />
                                Delete Province
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* =========================================================================
            CITIES TABLE (IMAGE 4)
           ========================================================================= */}
        {currentTab === 'cities' && (
          <table className="image-data-table">
            <thead>
              <tr>
                <th style={{ width: '35%' }}>CITY NAME</th>
                <th style={{ width: '20%' }}>PROVINCE</th>
                <th style={{ width: '20%' }}>AREAS COUNT</th>
                <th style={{ width: '20%' }}>SITES COUNT</th>
                <th style={{ width: '5%', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    Loading cities...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                    No cities found. Click "+ Add City" to create one.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((city) => (
                  <tr key={city.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building size={16} color="#059669" />
                        <strong className="image-item-name">{city.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="image-parent-pill">{city.province_name || '—'}</span>
                    </td>
                    <td>
                      <span className="image-count-badge">{city.areas_count} Areas</span>
                    </td>
                    <td>
                      <span className="image-count-badge">{city.sites_count} Sites</span>
                    </td>
                    <td style={{ textAlign: 'center', width: '48px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <div className="action-dropdown-wrapper">
                        <button
                          type="button"
                          className="action-dots-btn"
                          onClick={() => setOpenActionId(openActionId === city.id ? null : city.id)}
                          title="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openActionId === city.id && (
                          <div className="action-menu-dropdown right-aligned">
                            {hasPermission('LOCATION_DELETE') && (
                              <button
                                type="button"
                                className="action-menu-item danger"
                                onClick={(e) => handleDeleteLocation(city.id, city.name, e)}
                              >
                                <Trash2 size={13} />
                                Delete City
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* =========================================================================
            AREAS TABLE (IMAGE 5)
           ========================================================================= */}
        {currentTab === 'areas' && (
          <table className="image-data-table">
            <thead>
              <tr>
                <th style={{ width: '35%' }}>AREA NAME</th>
                <th style={{ width: '20%' }}>PROVINCE</th>
                <th style={{ width: '20%' }}>CITY</th>
                <th style={{ width: '20%' }}>SITES COUNT</th>
                <th style={{ width: '5%', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    Loading areas...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                    No areas found. Click "+ Add Area" to create one.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((area) => (
                  <tr key={area.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Map size={16} color="#059669" />
                        <strong className="image-item-name">{area.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="image-parent-pill">{area.province_name || '—'}</span>
                    </td>
                    <td>
                      <span className="image-parent-pill">{area.city_name || '—'}</span>
                    </td>
                    <td>
                      <span className="image-count-badge">{area.sites_count} Sites</span>
                    </td>
                    <td style={{ textAlign: 'center', width: '48px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <div className="action-dropdown-wrapper">
                        <button
                          type="button"
                          className="action-dots-btn"
                          onClick={() => setOpenActionId(openActionId === area.id ? null : area.id)}
                          title="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openActionId === area.id && (
                          <div className="action-menu-dropdown right-aligned">
                            {hasPermission('LOCATION_DELETE') && (
                              <button
                                type="button"
                                className="action-menu-item danger"
                                onClick={(e) => handleDeleteLocation(area.id, area.name, e)}
                              >
                                <Trash2 size={13} />
                                Delete Area
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* =========================================================================
            SITES TABLE
           ========================================================================= */}
        {currentTab === 'sites' && (
          <table className="image-data-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>SITE NAME</th>
                <th style={{ width: '18%' }}>PROVINCE</th>
                <th style={{ width: '18%' }}>CITY</th>
                <th style={{ width: '18%' }}>AREA</th>
                <th style={{ width: '12%' }}>NVRS COUNT</th>
                <th style={{ width: '4%', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    Loading sites...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                    No sites found. Click "+ Add Site" to create one.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MapPin size={16} color="#059669" />
                        <strong className="image-item-name">{site.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="image-parent-pill">{site.province_name || '—'}</span>
                    </td>
                    <td>
                      <span className="image-parent-pill">{site.city_name || '—'}</span>
                    </td>
                    <td>
                      <span className="image-parent-pill">{site.area_name || '—'}</span>
                    </td>
                    <td>
                      <span className="image-count-badge">{site.nvrs_count} NVRs</span>
                    </td>
                    <td style={{ textAlign: 'center', width: '48px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <div className="action-dropdown-wrapper">
                        <button
                          type="button"
                          className="action-dots-btn"
                          onClick={() => setOpenActionId(openActionId === site.id ? null : site.id)}
                          title="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openActionId === site.id && (
                          <div className="action-menu-dropdown right-aligned">
                            {hasPermission('LOCATION_DELETE') && (
                              <button
                                type="button"
                                className="action-menu-item danger"
                                onClick={(e) => handleDeleteLocation(site.id, site.name, e)}
                              >
                                <Trash2 size={13} />
                                Delete Site
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Bottom Pagination Bar matching Images 3, 4, 5 */}
        <div className="image-pagination-bar">
          <div className="image-pagination-left">
            <select
              className="image-page-size-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10 / page ▾</option>
              <option value={20}>20 / page ▾</option>
              <option value={50}>50 / page ▾</option>
            </select>
          </div>

          <div className="image-pagination-right">
            <button
              type="button"
              className="image-page-nav-btn"
              disabled={validPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>

            <div className="image-page-current-pill">
              {validPage} / {totalPages}
            </div>

            <button
              type="button"
              className="image-page-nav-btn"
              disabled={validPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL: ADD LOCATION (PROVINCE / CITY / AREA / SITE)
         ========================================================================= */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building size={20} color="#059669" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  {currentTab === 'provinces'
                    ? 'Add New Province'
                    : currentTab === 'cities'
                    ? 'Add New City'
                    : currentTab === 'areas'
                    ? 'Add New Area'
                    : 'Add New Site'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLocation} style={{ padding: '22px' }}>
              {addError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '16px' }}>
                  {addError}
                </div>
              )}

              {/* PROVINCES TAB: Pick from Master Pakistan JSON or Custom */}
              {currentTab === 'provinces' && (
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="form-label">Province Name *</label>
                  <select
                    className="form-input"
                    value={masterProvinces.includes(addName) ? addName : (addName ? '__custom__' : '')}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomEntry(true);
                        setAddName('');
                      } else {
                        setIsCustomEntry(false);
                        setAddName(e.target.value);
                      }
                    }}
                    required
                  >
                    <option value="">Select Province</option>
                    {masterProvinces.map((prov) => (
                      <option key={prov} value={prov}>
                        {prov}
                      </option>
                    ))}
                    <option value="__custom__">+ Enter Custom Province Name</option>
                  </select>

                  {isCustomEntry && (
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: '8px' }}
                      placeholder="Enter Province Name"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      required
                      autoFocus
                    />
                  )}
                </div>
              )}

              {/* CITIES TAB: Select System Province -> Pick from Master Pakistan JSON Cities or Custom */}
              {currentTab === 'cities' && (
                <>
                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="form-label">Parent Province *</label>
                    <select
                      className="form-input"
                      value={modalProvinceId}
                      onChange={(e) => {
                        setModalProvinceId(e.target.value);
                        setAddName('');
                        setIsCustomEntry(false);
                      }}
                      required
                    >
                      <option value="">Select Province</option>
                      {(locationsSummary.provinces || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">City Name *</label>
                    <select
                      className="form-input"
                      disabled={!modalProvinceId}
                      value={masterCities.includes(addName) ? addName : (addName ? '__custom__' : '')}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomEntry(true);
                          setAddName('');
                        } else {
                          setIsCustomEntry(false);
                          setAddName(e.target.value);
                        }
                      }}
                      required
                    >
                      <option value="">Select City</option>
                      {masterCities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                      <option value="__custom__">+ Enter Custom City Name</option>
                    </select>

                    {isCustomEntry && (
                      <input
                        type="text"
                        className="form-input"
                        style={{ marginTop: '8px' }}
                        placeholder="Enter City Name"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        required
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}

              {/* AREAS TAB: Select System Province -> Select System City -> Pick from Master Areas or Custom */}
              {currentTab === 'areas' && (
                <>
                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="form-label">Parent Province *</label>
                    <select
                      className="form-input"
                      value={modalProvinceId}
                      onChange={(e) => {
                        setModalProvinceId(e.target.value);
                        setModalCityId('');
                        setAddName('');
                        setIsCustomEntry(false);
                      }}
                      required
                    >
                      <option value="">Select Province</option>
                      {(locationsSummary.provinces || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="form-label">Parent City *</label>
                    <select
                      className="form-input"
                      disabled={!modalProvinceId}
                      value={modalCityId}
                      onChange={(e) => {
                        setModalCityId(e.target.value);
                        setAddName('');
                        setIsCustomEntry(false);
                      }}
                      required
                    >
                      <option value="">Select City</option>
                      {(locationsSummary.cities || [])
                        .filter((c) => String(c.parent_id) === String(modalProvinceId))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">Area Name *</label>
                    <select
                      className="form-input"
                      disabled={!modalCityId}
                      value={masterAreas.includes(addName) ? addName : (addName ? '__custom__' : '')}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomEntry(true);
                          setAddName('');
                        } else {
                          setIsCustomEntry(false);
                          setAddName(e.target.value);
                        }
                      }}
                      required
                    >
                      <option value="">Select Area</option>
                      {masterAreas.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                      <option value="__custom__">+ Enter Custom Area Name</option>
                    </select>

                    {isCustomEntry && (
                      <input
                        type="text"
                        className="form-input"
                        style={{ marginTop: '8px' }}
                        placeholder="Enter Area Name"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        required
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}

              {/* SITES TAB: Select System Province -> Select System City -> Select System Area -> User types Site Name */}
              {currentTab === 'sites' && (
                <>
                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="form-label">Parent Province *</label>
                    <select
                      className="form-input"
                      value={modalProvinceId}
                      onChange={(e) => {
                        setModalProvinceId(e.target.value);
                        setModalCityId('');
                        setModalAreaId('');
                      }}
                      required
                    >
                      <option value="">Select Province</option>
                      {(locationsSummary.provinces || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="form-label">Parent City *</label>
                    <select
                      className="form-input"
                      disabled={!modalProvinceId}
                      value={modalCityId}
                      onChange={(e) => {
                        setModalCityId(e.target.value);
                        setModalAreaId('');
                      }}
                      required
                    >
                      <option value="">Select City</option>
                      {(locationsSummary.cities || [])
                        .filter((c) => String(c.parent_id) === String(modalProvinceId))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label className="form-label">Parent Area *</label>
                    <select
                      className="form-input"
                      disabled={!modalCityId}
                      value={modalAreaId}
                      onChange={(e) => setModalAreaId(e.target.value)}
                      required
                    >
                      <option value="">Select Area</option>
                      {(locationsSummary.areas || [])
                        .filter((a) => String(a.parent_id) === String(modalCityId))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">Site / Facility Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      disabled={!modalAreaId}
                      placeholder="Enter Site Name"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || !addName.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} />
                  <span>{isSubmitting ? 'Saving...' : 'Add Location'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
