export const CATEGORIAS = [
  { value: 'mini', label: 'Mini' },
  { value: 'infantil', label: 'Infantil' },
  { value: 'menores', label: 'Menores' },
  { value: 'promocional', label: 'Promocional' },
  { value: 'libre', label: 'Libre' },
];

export const CATEGORIA_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

export const GENERO_LABEL = {
  femenino: 'Femenino',
  masculino: 'Masculino',
};
