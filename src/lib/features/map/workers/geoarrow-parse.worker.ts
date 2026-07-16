import { setupParseWorker } from '@ateliercartographie/geoarrow-deck-stream/worker';

import { khartisProjectionFactories } from '../utils/khartis-projection-factories.utils';

setupParseWorker({ projections: khartisProjectionFactories });
