import api from '../../lib/api';

export interface Service {
  id: string;
  businessId: string;
  name: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePayload {
  name: string;
  price: number;
  isActive?: boolean;
}

const d = <T>(res: { data: T }) => res.data;

export const servicesApi = {
  list: () => api.get<Service[]>('/services').then(d<Service[]>),
  create: (payload: ServicePayload) =>
    api.post<Service>('/services', payload).then(d<Service>),
  update: (id: string, payload: Partial<ServicePayload>) =>
    api.patch<Service>(`/services/${id}`, payload).then(d<Service>),
  remove: (id: string) => api.delete(`/services/${id}`),
};
