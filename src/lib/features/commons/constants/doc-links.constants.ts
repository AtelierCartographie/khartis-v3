const KHARTIS_SITE_URL =
  'https://www.sciencespo.fr/cartographie/fr/outils/khartis';
const USER_GUIDE_URL = `${KHARTIS_SITE_URL}/mode-emploi`;

export const DOC_LINK = {
  HELP_AND_RESOURCES: `${KHARTIS_SITE_URL}#aide-et-ressources`,
  IMPORT_DATA: `${USER_GUIDE_URL}#importer-des-données`,
  CONTROL_DATA: `${USER_GUIDE_URL}#contrôler-les-données`,
  GEOLOCATE_DATA: `${USER_GUIDE_URL}#géolocaliser-les-données`,
  IMPORT_BASEMAP: `${USER_GUIDE_URL}#importer-un-fond-de-carte`,
  REFERENCE_BASEMAP: `${USER_GUIDE_URL}#fond-de-référence`,
  DISCRETIZATION: `${USER_GUIDE_URL}#discrétisation`,
  MAP_COLLECTIONS: `${USER_GUIDE_URL}#créer-une-collection-de-cartes`
} as const;

export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdobFeupR7CFppaMTEScMXoSHVUMl39grV3aBsoHzw1NpaHdw/viewform';
