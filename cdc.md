version 3.0
Cahier des charges Document confidentiel

Atelier de cartographie de Sciences Po mars 2025
TABLE DES MATIÈRES

1. INTRODUCTION........................................................................................................................................... 3 1.A. Contexte...............................................................................................................................................3 1.B. Présentation de Khartis........................................................................................................................3 1.C. Objectifs de la refonte..........................................................................................................................3 1.D. Périmètre............................................................................................................................................. 4
2. SPÉCIFICATIONS FONCTIONNELLES....................................................................................................... 4 2.A. Données...............................................................................................................................................4 2.B. Visualisations....................................................................................................................................... 8 2.C. Habillage............................................................................................................................................14 2.D. Téléchargement.................................................................................................................................16 2.E. Sauvegarde........................................................................................................................................17 2.F. Exemples introductifs..........................................................................................................................17 2.G. Aide et pages annexes...................................................................................................................... 17
3. SPÉCIFICATIONS TECHNIQUES.............................................................................................................. 17 3.A. Technologies envisagées...................................................................................................................17 3.B. Performances.....................................................................................................................................19 3.C. Compatibilité...................................................................................................................................... 19 3.D. Responsive design.............................................................................................................................19 3.E. Accessibilité....................................................................................................................................... 19 3.F. Raccourcis clavier...............................................................................................................................19 3.G. Multilinguisme....................................................................................................................................19 3.H. Analyse d’audience.............................................................................................................20 3.I. Sécurité et protection des données.....................................................................................................20 3.J. Hébergement......................................................................................................................................20 3.K. Licence...............................................................................................................................................20
4. INTÉGRATION DE LA CONCEPTION UI/UX............................................................................................. 20 4.A. Parcours utilisateur............................................................................................................................ 20 4.B. Design System...................................................................................................................................21 4.C. Structure de l’interface.......................................................................................................................21 4.D. Maquettes.......................................................................................................................................... 23
5. DÉPLOIEMENT, MAINTENANCE ET ÉVOLUTION................................................................................... 25 5.A. Environnement de déploiement......................................................................................................... 25 5.B. Documentation du code..................................................................................................................... 25 5.C. Maintenance...................................................................................................................................... 25
6. GESTION DE PROJET ET CALENDRIER................................................................................................. 25 6.A. Contrat............................................................................................................................................... 25 6.B. Mode opératoire.................................................................................................................................26 6.C. Ressources........................................................................................................................................26 6.D. Calendrier.......................................................................................................................................... 26 6.E. Clauses de confidentialité.................................................................................................................. 26
7. RÉPONSE ATTENDUE............................................................................................................................... 26 7.A. Contenu..............................................................................................................................................26 7.B. Modalités de réponse.........................................................................................................................26
   Khartis v3 - Cahier des charges 2
8. INTRODUCTION
   1.A. Contexte
   1.A.1. Sciences Po
   Avec plus de 480 universités partenaires, Sciences Po est un établissement d’enseignement et de recherche de rang international. La formation initiale comptait en 2024 15000 étudiants, pour moitié internationaux, avec un taux d’encadrement fort (1230 personnels salariés de la Fondation Nationale des Sciences politiques, 265 enseignants/chercheurs de la faculté permanente et près de 4200 chargés de cours). En lien avec la formation initiale, la recherche s’appuie sur cinq écoles de la recherche (histoire, sciences politiques, économie, sociologie et droit) et onze centres de recherche, qui couvrent les sciences humaines et sociales.
   1.A.2. L’Atelier de cartographie
   L’Atelier de cartographie de Sciences Po est l’une des composantes de l’Institut des compétences et de l’innovation de Sciences Po. Il contribue aux missions de Sciences Po de production et de diffusion de savoirs qui éclairent les enjeux contemporains et alimentent le débat public : 1. par la diffusion en accès libre de la plupart de ses productions ainsi que des ressources pédagogiques autour de la visualisation de données, 2. par la formation et l’accompagnement des étudiants, enseignants ou chercheurs aux méthodes et techniques d’analyse, de traitement et de visualisation de données et 3. par le développement de solutions ou d’outils open source de dataviz qui permettent de faire ses propres représentations en autonomie (ex. Khartis et Graticule).
   1.B. Présentation de Khartis
   L’idée de Khartis est née en 2015 : proposer en ligne un outil open source de cartographie thématique/statistique utilisable aussi par des non-spécialistes. Grâce à une ergonomie particulièrement pensée et soignée, l’utilisateur peut hiérarchiser les paramètres de création et tirer parti des fonctions rapides et puissantes de l’outil.
   Sa naissance est liée à 3 facteurs : 1. un appel à projet IDEX remporté par l’Atelier de cartographie qui a permis de lever les fonds nécessaires, 2. les technologies libres et contributives comme D3.js, mobilisables dans l’outil et enfin 3. l’accès à des données de plus en plus ouvertes et de bonne qualité grâce à l'open data ou à la directive Inspire en Europe.
   Ainsi, tout en étant maître de la conception et de l’ergonomie de l’outil, l’Atelier de cartographie a bénéficié de l’expérience du Médialab de Sciences Po dans la conduite du projet (méthode agile par itérations) et a fait appel à la société Apyx d’Arnaud Pezel pour les développements. Le projet aura duré 18 mois (dont 6 mois de développement) avec une restitution en décembre 2016.
   La vocation initiale de l’outil (par contrat spécifié dans l’appel à projet IDEX) était de rendre les étudiants et les enseignants de SHS autonomes dans leurs pratiques de cartes thématiques, quelle que soit leur discipline, dès la première année à l’université. La suite montre que le public-cible s’est considérablement élargi à des universitaires d’autres disciplines, des journalistes, des collectivités territoriales ou des curieux.
   1.C. Objectifs de la refonte
   L’Atelier souhaite pérenniser l’outil et identifie au moins 3 limites à son maintien en l’état : 1. Khartis est maintenant ancien et des technologies web pourraient en améliorer l’utilisation et les performances, 2. les limites de ses performances sont sans doute liées à un développement en plusieurs étapes, par patchs successifs, qui affecte la cohérence d’ensemble et enfin 3. Le code de l’outil est mal voire pas documenté, ce qui gêne sans doute l’évolution de Khartis et la contribution à des développements ultérieurs.
   Khartis v3 - Cahier des charges 3
   Un audit, mené fin 2022 par Éric Mauvière, avec sa société Icem7, a permis de souligner les limites identifiées par l’Atelier de cartographie. L’inventaire des forces et faiblesses de l’outil, des préconisations et des propositions de scénarios d’évolution ont servi de base pour la conception de la future version de Khartis.
   La troisième version de Khartis mérite donc une remise à plat totale où les technologies utilisées, son parcours utilisateur et son interface ont été entièrement repensés.
   1.D. Périmètre
   Ce projet inclut le développement et l’intégration des ressources existantes, développées où conçues par l’équipe de l’Atelier de cartographie.
   La conception générale de l’outil, tant au niveau des fonctionnalités que de l’interface ou l’expérience utilisateurs (UI/UX), la plateforme d’aide à l’utilisateur et la page de présentation de l’outil, ne sont pas inclus dans le projet.
9. SPÉCIFICATIONS FONCTIONNELLES
   Pour faciliter la structuration, les fonctionnalités décrites ci-dessous seront principalement ventilées selon les trois grandes étapes de la réalisation d’une carte thématique, que nous retrouverons aussi dans le parcours utilisateur, à savoir Données, Visualisations et Habillage.
   2.A. Données
   L’outil devra accepter deux grands types de données en entrée : des données tabulaires et des données dites géographiques, contenant une géométrie associée à des attributs.
   2.A.1. Import de données tabulaires
   Ces données seront importées via le chargement d’un fichier csv à partir de l’appareil de l’utilisateur, via un lien vers un fichier csv hébergé en ligne, ou par un copier-coller. Chaque ligne du tableau représentera un objet localisé sur la carte. Pour être exploités, ces tableaux devront donc contenir l’une de ces variables géographiques :

- des noms de lieux ou des codes géographiques (ISO3, etc.) qui seront reconnus par l’outil et liés à des fonds de cartes intégrés à l’application ou fournis ensuite par l’utilisateur ; - des coordonnées géographiques (latitude et longitude), dissociées dans deux colonnes distinctes.
  2.A.2. Import de données géographiques
  Ces fichiers d’informations géographiques contiennent des objets géométriques (points, lignes, ou polygones) et un tableau de données associé. L’outil devra pouvoir importer tous les formats standards comme les formats Shapefile, GeoJSON ou GeoPackage. Les fichiers pourront être chargés à partir de l’appareil de l’utilisateur ou via un lien vers un fichier ou plusieurs fichiers hébergés en ligne.
  Les fichiers d’informations géographiques pourront être exploités de deux manières : soit pour réaliser des visualisations, soit comme fond de carte, lié à des données tabulaires, importées par l’utilisateur.
  2.A.3. Création de jeux de données
  Une fois les données importées, quelle que soit leur nature, l’outil les identifiera comme un jeu de données pouvant être mobilisé tout au long de la chaîne de traitement. Plusieurs imports seront possibles, laissant alors le choix à l’utilisateur de disposer d’autant de jeux de données qu’il le souhaite.
  Khartis v3 - Cahier des charges 4
  Chaque jeu de données sera par défaut nommé par le nom du fichier initialement importé, intitulé “Tableau collé” s’il s’agît d’un copier-coller, ou bien renommé par l’utilisateur.
  Chaque jeu de données pourra être dupliqué ou supprimé par l’utilisateur.
  2.A.4. Typage des variables
  Une fois les données importées, l’outil analysera le tableau de données et détectera le type de chaque variable : texte ou numérique. Un sous-type “géographique” sera détecté selon le contenu de la variable (entités administratives, code ISO ou coordonnées géographiques). L’utilisateur sera en capacité de changer le type des variables au sein de l’aperçu du tableau, où chaque type aura une représentation graphique distincte.
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  2.A.5. Aperçu et traitement du tableau de données
  Quel que soit le type de données importées, l’outil devra pouvoir représenter le tableau de données. Celui-ci sera présent au sein d’un panneau latéral à taille variable et seul un nombre restreint de lignes sera affiché. L’utilisateur pourra faire défiler les lignes au sein de cette fenêtre restreinte et l’agrandir au besoin à une taille prédéfinie.
  Plusieurs fonctionnalités seront possibles, pour contrôler les données et pour effectuer des opérations simples.
  2.A.5.a. Intitulé des variables et actions
  Chaque variable disposera d’un code graphique, comme décrit précédemment. Au survol de l’intitulé, une liste déroulante permettra plusieurs actions :
- Changer le type, au cas où l'algorithme n’aurait pas bien analysé la variable,
- Affiner, où l’utilisateur pourra changer la casse des valeurs de la variable (majuscules vers minuscules et vice-versa) ou bien supprimer les espaces (avant, après et les espaces consécutifs).
- Renommer
- Masquer, pour que la variable ne soit plus visible dans les listes déroulantes lors des traitements suivants,
- Supprimer.
  2.A.5.b. Résumé statistique
  Chaque variable du tableau contiendra sous son intitulé, un court résumé statistique, parfois visuel selon son type. En cas d’anomalies au sein des variables, ces erreurs pourront être mentionnées, mais sans actions possibles pour les corriger. De plus, le nombre de lignes du tableau sera précisé dans cet en-tête.
  Pour les variables géographiques, le résumé affichera le nombre d’objets uniques. Il pourra également préciser le nombre d’éventuelles valeurs nulles ou de doublons.
  Pour les variables de type texte (catégories), le résumé affichera le nombre de catégories.
  Pour les variables de type numérique, le résumé affichera un histogramme de fréquence, les valeurs min et max, et le nombre de valeurs nulles.
  Ce résumé sera affiché par défaut ou masqué par action de l’utilisateur.
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  2.A.5.c. Tri
  Chaque variable pourra être triée par ordre croissant/décroissant ou alphabétique selon son type.
  Khartis v3 - Cahier des charges 5
  2.A.5.d. Recherche
  L’outil proposera un outil de recherche pour identifier des données au sein du tableau et sur la carte. Il sera possible de resserrer la recherche à une variable particulière pour effectuer une recherche.
  Lors d’une recherche, l’outil affichera un nombre de résultats, des boutons pour parcourir les résultats et une mise en avant au sein du tableau.
  La fonctionnalité de rechercher/remplacer sera possible via ce même outil en précisant la valeur de remplacement.
  2.A.5.e. Filtres
  L’outil permettra d’ajouter un ou plusieurs filtres. Chaque filtre précisera la variable sur laquelle il agît, l’opérateur et auquel cas une valeur. Chaque filtre sera supprimable.
  Un résumé graphique indiquera le nombre de valeurs filtrées et un pourcentage.
  Liste des opérateurs : supérieur ou égal, inférieur ou égal, contient, égal à, différent de, compris entre, top ascendant/descendant (avec précision de la valeur), vide, pas vide
  2.A.5.f. Calculatrice
  L’outil permettra d’ajouter une nouvelle variable définie par un calcul simple.
  Une formule pourra être saisie en sélectionnant des variables, des opérateurs (addition, soustraction, multiplication, division). Cette saisie pourra idéalement être saisie à l’aide d’auto-complétion. Des calculs à l’aide de fonctions (moyenne, puissance, arrondis, concaténation, extraction) seront également possibles via ce même champ. La formule pourra être testée avant d’être validée.
  2.A.5.g. Corbeille
  L’outil pourra supprimer des variables ou des lignes en sélectionnant les objets à supprimer et en validant la suppression. Un avertissement sera présent s’il y a une incidence sur les visualisations réalisées en amont.
  2.A.5.h. Réinitialisation
  L’outil pourra réinitialiser les données en rétablissant les données initialement chargées. Toutes les modifications apportées et visualisations liées avant la réinitialisation seront perdues.
  2.A.6. Géolocalisation des données tabulaires
  L’outil reconnaîtra automatiquement les variables géographiques contenues dans les données tabulaires importées (pour rappel : entités administratives ou coordonnées géographiques). L’utilisateur pourra préciser/corriger ce choix si nécessaire en définissant une référence géographique et la ou les variables liées.
  2.A.7. Jointure à un fond de carte
  L’outil permettra de lier des données tabulaires à un fond de carte (fichier d'informations géographiques), issu d’un catalogue intégré à l’outil ou importé par l’utilisateur.
  Dans le cas où les données sont géolocalisées par des coordonnées géographiques, la superposition à un fond de carte OpenStreetMap sera possible, il n’y aura pas de réelle jointure mais une simple superposition.
  Dans le cas où un fichier géographique serait importé en début de parcours, il sera également possible de le superposer à un fond de carte avec les possibilités décrites ci-dessous.
  Khartis v3 - Cahier des charges 6
  2.A.7.a. Suggestions de fonds de carte
  En fonction de l’analyse automatique des données, l’outil proposera d’abord des suggestions de fonds de cartes issus du catalogue. Cette liste restreinte, présentée avec des vignettes, sera triée en fonction d’un taux de correspondance aux données. Chaque vignette affichera le fond de carte, un titre, son niveau de découpage, son année, sa source et le taux de correspondance avec les données tabulaires.
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  2.A.7.b. Catalogue de fonds de carte
  Le catalogue présentera également chaque fond sous forme de vignettes. Elles
  comprendront un titre, un niveau de découpage, l’année et la source. Un moteur de recherche avec auto complétion et des filtres par années permettront de faciliter l’exploitation du catalogue.
  L’utilisateur pourra suggérer l’ajout de fonds de carte au catalogue grâce à un bouton renvoyant vers un formulaire. Ces fonds seront réalisés par l’équipe de l’Atelier de cartographie.
  �� Ce catalogue et les fichiers liés seront fournis par l’équipe de l’Atelier de cartographie.
  2.A.7.c. Jointure assistée
  Une fois le fond de carte sélectionné, à l’exception d’OpenStreetMap, un module
  d’assistance à la jointure sera proposé permettant de corriger ou modifier les liens entre les données tabulaires et le fond de carte.
  Le module présentera 4 catégories, comptant chacune le nombre d’entités concernées. Les catégories suivantes seront classées par criticité : jointes, à vérifier, non uniques, non reconnues.
  Les identifiants corrigés pourront être remplacés dans le tableau de données par action de l’utilisateur.
  �� Une partie de cet algorithme sera fournie par l’équipe de l’Atelier de cartographie.
  2.A.7.d. Imports de fonds de carte
  Si aucun fonds de carte du catalogue ne convient à l’utilisateur, il pourra alors charger un fichier géographique comme fond de carte. Les fichiers acceptés et la procédure d’import seront similaires au chargement de fichiers géographiques possible en début de parcours (cf. 2.A.2. Import de données géographiques).
  Une fois l’import effectué, l’utilisateur pourra, si possible, réaliser la jointure entre ses données tabulaires. Dans le cas où elles ne contiendraient que des coordonnées géographiques, cette étape ne serait pas utile et donc présente.
  Le module de jointure assistée décrit ci-dessus sera également disponible en fin de parcours de cette fonctionnalité.
  2.A.7.e. Superposition à un fond OpenStreetMap
  En cas d’import de données tabulaires géolocalisées par des coordonnées géographiques, ces localités pourront se superposer à un fond de carte OpenStreetMap.
  Ce fond pourra être personnalisé à une étape ultérieure (cf. 2.B.3.c. Personnalisation d’un fond OpenStreetMap).
  2.A.8. Enrichir un fichier géographique
  En cas d’import d’un fichier géographique en début de parcours, l’utilisateur aura la possibilité de joindre à ce fichier des données tabulaires. La procédure d’import sera similaire à celle présente en
  Khartis v3 - Cahier des charges 7
  début de parcours (cf. 2.A.1. Import de données tabulaires). Seules des données tabulaires comprenant des entités géographiques et non des coordonnées géographiques seront acceptées pour réaliser cette jointure.
  Trois étapes suivront l’import des données tabulaires. Premièrement l’aperçu du tableau importé, similaire à celui décrit précédemment (cf. 2.A.5. Aperçu et traitement du tableau de données), à la seule différence que les outils de contrôle et traitements ne seront pas disponibles (recherche, filtre, calculatrice, corbeille). La deuxième étape concernera la géolocalisation des données où l’utilisateur choisira les variables communes au fichier géographique et aux données tabulaires pour réaliser la jointure. Enfin, une troisième et dernière étape sera la jointure assistée, équivalente à celle décrite précédemment (cf. 2.A.7.c. Jointure assistée).
  Les données jointes seront ensuite visibles dans l’aperçu du tableau de données lié au fichier géographique.
  2.A.9. Aperçu de la carte
  Une fois les données importées, une carte sera directement visible sur une page blanche au centre de l’interface. Il s’agira du premier fond de carte suggéré par l’outil ou bien s’il n’y en a pas, un planisphère qui sera le fond par défaut.
  2.A.9.a. Infobulles
  Au survol, ou au toucher selon le terminal utilisé, une infobulle fixe affichera les données liées à l’objet survolé. Si une visualisation est créée, la ou les variables concernées par la visualisation seront d’abord présentées. Les autres seront rassemblées dans un accordéon replié.
  Cette fonctionnalité sera présente tout au long du parcours utilisateur.
  2.A.9.b. Fond de carte par défaut
  En cas d’import de données tabulaires, une fonctionnalité sélectionnera par défaut le fond de carte le plus adapté aux données importées par l’utilisateur (cf. 2.A.7.a. Suggestions de fonds de carte). Si aucun fond du catalogue ne correspond aux données tabulaires importées, un planisphère avec un découpage par pays sera affiché par défaut.
  En cas d’import d’un fichier géographique, la géométrie du fichier sera affichée sur la page.
  2.A.9.c. Zoom
  L’aperçu de la page et de la carte sera de taille variable selon des boutons de zoom. L’utilisateur pourra choisir s’il souhaite agrandir la vue de la page ou bien de la carte.
  Cette fonctionnalité sera présente tout au long du parcours utilisateur.
  2.B. Visualisations
  Quelle que soit la nature des données importées en amont, l’utilisateur pourra après l’étape Données, accéder à l’étape Visualisations lui permettant de traîter graphiquement les données importées.
  2.B.1. Création de visualisations
  Le passage à l’étape Visualisations crée automatiquement une visualisation liée aux données importées précédemment. Plusieurs visualisations pourront être créées, laissant alors la possibilité à l’utilisateur de disposer d’autant de visualisations qu’il le souhaite.
  Chaque visualisation sera nommée par défaut “Visualisation (1)”, avec incrémentation. Chaque visualisation pourra être renommée, dupliquée ou supprimée par l’utilisateur. Lors de la création d’une visualisation, l’utilisateur pourra choisir le jeu de données à visualiser. Khartis v3 - Cahier des charges 8
  2.B.2. Choisir une visualisation
  L’outil proposera une sélection de visualisations préconçues et adaptées aux données sélectionnées que l’utilisateur pourra personnaliser à souhait. Si ces propositions ne conviennent pas, l’utilisateur pourra créer sa visualisation ex nihilo.
  2.B.2.a. Suggestions de visualisations
  Des propositions de visualisations seront proposées à l’utilisateur, en s’appuyant sur le profil des données chargées. Ces exemples, modifiables, serviront également à montrer la variété de visualisations possibles avec Khartis.
  Chaque suggestion sera présentée avec une carte dans laquelle figurera une vignette avec un aperçu générique de la visualisation, le ou les noms des primitives graphiques mobilisées (symboles, polygones, lignes et textes), le type (uniques, proportionnels, en classe ou en catégories) et les variables concernées par la visualisation.
  La suggestion ayant le score de correspondance aux données le plus élevé sera
  sélectionnée par défaut et représentée directement sur la carte.
  Le nombre de suggestions sera restreint à trois propositions. L’utilisateur pourra s’il le souhaite, et si possible, afficher d’autres suggestions, trois par trois.
  Lorsque une suggestion de visualisation sera sélectionnée, un ensemble de paramètres sera préréglé, que l’utilisateur pourra personnaliser.
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  2.B.2.b. Paramétrer la visualisation
  L’outil proposera un ensemble de réglages regroupés par primitives graphiques : symboles, polygones, lignes et textes. Chacune de ces primitives pourra être affichée, masquée et filtrée. Le filtre aura les mêmes fonctionnalités et que celui présent dans le tableau de données (cf. 2.A.5.e. Filtres).
  Selon les primitives, la taille, l’épaisseur, la forme, la couleur de fond ou de contour pourront être personnalisées et varieront souvent selon une variable quantitative ou qualitative.
  Ces réglages, très nombreux et parfois propres à chaque primitives, ont été prévus par l’Atelier de cartographie et sont définis et présentés dans des ressources annexes mises à dispositions du prestataire.
  2.B.2.c. Personnalisation des couleurs
  Le choix et les réglages liés aux couleurs seront avancés et contextualisés pour orienter l’utilisateur, notamment via des suggestions. Tous ces réglages seront regroupés dans un panneau dédié.
  Suggestions de couleurs
  Selon le type de données visualisées, des familles de couleurs (palettes qualitatives) ou de palettes séquentielles pourront être proposées pour avoir des couleurs harmonieuses et des thèmes graphiques distincts. Des filtres permettront d’affiner ces propositions, dont un filtre “Daltonisme” qui proposera des couleurs plus accessibles. Ces sélections seront fournies par l’équipe de l’Atelier de cartographie.
  Intensité
  Lors du choix d’une couleur unique, une section permettra de choisir l’intensité d’une couleur sélectionnée en proposant des nuances plus sombres et d’autres plus lumineuses.
  Khartis v3 - Cahier des charges 9
  Couleur personnalisée
  Outre les suggestions de couleurs, l’utilisateur pourra définir lui-même la couleur de son choix via un panneau contenant plusieurs réglages. Parmi eux, le choix de la teinte, la saturation et la luminosité. Le code hexadécimal pourra aussi être affiché et saisi.
  Motif
  L’utilisateur pourra faire le choix de représenter un aplat en motif personnalisable. La forme, l’angle (0, 45 et 315 degrés), la taille et l’échelle pourront être précisés.
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  Palettes séquentielles
  Outre les suggestions de palettes séquentielles, l’utilisateur pourra personnaliser sa palette en précisant la couleur à partir de laquelle il souhaite créer une palette. Il pourra aussi préciser la couleur de départ et la couleur d’arrivée ou encore réaliser une palette composée de motifs.
  Une option permettra ici d’inverser la palette séquentielle.
  Palettes divergentes
  Si l’utilisateur précise une valeur de rupture dans sa discrétisation (cf. point suivant), une palette divergente sera appliquée.
  Comme pour les palettes séquentielles, une sélection de palettes sera proposée. Les mêmes réglages que ceux des palettes séquentielles seront également présents.
  2.B.2.d. Discrétisation
  La discrétisation en visualisation de données consiste à découper des données continues et les regrouper en classes, facilitant alors leur analyse et leur représentation graphique. Cela permet de simplifier les données et de mieux identifier des tendances.
  Il existe plusieurs méthodes statistiques pour réaliser ces découpages. L’utilisateur pourra sélectionner une méthode et préciser le nombre de classes souhaitées. Les méthodes et des ressources liées à celles-ci seront fournies par l’équipe de l’Atelier de cartographie.
  Une valeur de rupture pourra être indiquée permettant alors d’obtenir une palette de couleurs divergente. La position de cette valeur de rupture pourra être précisée.
  Une représentation graphique du découpage en classes avec un diagramme de fréquences sera présente. Celle-ci permettra aussi à l’utilisateur de saisir manuellement les bornes de chaque classe s’il souhaite affiner ou réaliser une discrétisation manuelle.
  Une courte définition de la discrétisation sélectionnée sera également proposée pour aider l’utilisateur à faire son choix.
  2.B.2.e. Légende de la visualisation
  Comme indiqué précédemment, la visualisation sélectionnée et les changements de paramètres seront simultanément visibles sur la carte, comme la légende de cette visualisation.
  Cette légende sera personnalisable via un outil dédié, disponible à l’étape Habillage, 3ème et dernière étape du parcours utilisateur (cf. 2.C.2.b. Légende).
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  Khartis v3 - Cahier des charges 10
  2.B.3. Personnaliser le fond de carte
  Quel que soit le fond de carte sélectionné, l’outil permettra de personnaliser l’aspect du fond de carte, à minima la couleur de fond des polygones, la couleur des contours, l’épaisseur, les pointillés ou encore l’opacité. Une option d’ombre portée sera également disponible. Les styles par défaut seront fournis par l’Atelier de cartographie.
  2.B.3.a. Personnalisation d’un fond de carte du catalogue
  Pour ces fonds, une personnalisation avancée sera possible avec différentes couches d'informations. Chacune de ces couches pourra être affichée, masquée et personnalisée. Par exemple, pour un fond de carte mondial, les couches suivantes seront présentes : terre, mers/océans, lacs et rivières, relief, équateur, méridiens/parallèles, frontières/limites, villes.
  Les réglages pour personnaliser ces couches additionnelles seront propres à chaque couche et précisés dans une ressource annexe mise à disposition du prestataire et détaillés dans les maquettes UI/UX.
  Comme les fonds de cartes du catalogue, les couches additionnelles seront fournies par l’Atelier de cartographie.
  2.B.3.b. Personnalisation d’un fond de carte importé
  Pour les fonds importés par l’utilisateur, la personnalisation sera réduite et aucune couche additionnelle ne sera disponible. La couleur de fond des polygones, la couleur, l’épaisseur et les pointillés des contours ou des lignes, l’opacité des polygones et des contours, l’ajout d’une ombre portée prédéfinie feront partie des réglages proposés. Ces réglages seront également précisés dans les maquettes UI/UX.
  2.B.3.c. Personnalisation d’un fond OpenStreetMap
  Pour un fond OpenStreetMap, la personnalisation sera possible via quelques styles prédéfinis, par le choix de calques d’informations à afficher/masquer et par l’affichage d’étiquettes.
  Comme pour les réglages précédents décrits plus haut, ces derniers seront précisés dans une ressource annexe mise à disposition du prestataire et/ou détaillés dans les maquettes UI/UX.
  2.B.4. Outils de visualisation
  Tout au long de l’étape de visualisation des données, l’utilisateur aura à disposition des outils pour l’aider à construire et personnaliser sa carte.
  2.B.4.a. Recherche
  Cet outil proposera une barre de recherche pour identifier une entité ou une valeur, qui sera mise en lumière sur la carte.
  Lors d’une recherche, l’outil affichera un nombre de résultats, des boutons pour parcourir les résultats et une mise en avant de l’objet pointé sur la carte avec une infobulle affichant les données attributaires de l’objet. Celle-ci sera présentée de la même façon que celle au survol de la carte décrite précédemment (cf. 2.A.5.c Infobulle).
  2.B.4.b. Calques
  Chaque visualisation créée générera un calque, qui contiendra lui-même des sous-calques avec un calque par primitive graphique mobilisée et des calques liés au fond de carte. Un code couleur et une icône permettront d’identifier plus facilement ces différents types de sous-calques.
  Khartis v3 - Cahier des charges 11
  Chaque calque de visualisation pourra être affiché/masqué, proposera un raccourci vers le paramétrage et reprendra les mêmes fonctionnalités propres à la gestion d’une visualisation, à savoir renommer, dupliquer, supprimer (cf. 2.B.1. Création de visualisations).
  Les sous-calques, imbriqués dans les calques de visualisation, pourront aussi être affichés/masqués et proposeront également un raccourci vers le paramétrage de l’élément pointé.
  Chaque calque pourra être déplacé au-dessus ou au-dessous d’autres calques. Les sous-calques pourront aussi être déplacés au sein de leur calque parent.
  Dans le cas où plusieurs visualisations seraient présentes, les sous-calques liés au fond de cartes seront liés et identiques.
  En cas de collection de cartes (cf. 2.B.4.e. Collection), les calques seront regroupés par carte.
  2.B.4.c. Projections
  Une projection cartographique sera attribuée par défaut à chaque fond de carte. Celle-ci pourra être modifiée et paramétrée dans cet outil dédié. Une incitation à utiliser cet outil sera caractérisée par une pastille sur l’icône de cet outil, jusqu’à ce que l’utilisateur l’utilise.
  Suggestions de projections
  De la même manière que pour les fonds de cartes ou les visualisations, le choix de projections sera facilité par des suggestions. Celles-ci se baseront sur un algorithme qui proposera les projections les plus adaptées à l’emprise géographique du fond de carte ou des données importées.
  Ces suggestions seront filtrables selon trois catégories de projections : rectangulaires, arrondies et discontinues.
  Deux modes d’affichage des suggestions seront possibles : en liste et en grille, afin d’avoir une vue d’ensemble, avec les projections distribuées en colonnes selon les catégories.
  Pour la vue en liste, le nombre de suggestions sera restreint à trois propositions. L’utilisateur pourra s’il le souhaite, et si possible, afficher d’autres suggestions, trois par trois.
  Chaque suggestion sera présentée sous forme de carte composée d’une vignette avec un aperçu de la projection, un intitulé, sa catégorie et, pour certaines, une infobulle affichant une courte description de la projection et une étiquette indiquant si la projection respecte les surfaces.
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  Autres projections
  SI aucune suggestion ne convient à l’utilisateur, ou si aucune suggestion n’est possible, une section permettra de choisir sa projection, soit via un catalogue contenant une liste exhaustive de projections cartographiques, soit via un champ permettant de coller un code spécifique permettant d’obtenir la projection. Ce code est appelé CRS (système de coordonnées de référence) et devra être apporté au format WKT (Well-Known Text) ou PROJ.4.
  Les ressources concernant ce catalogue de projections seront fournies par l’équipe de l’Atelier de cartographie.
  Paramètres
  Si l’utilisateur souhaite personnaliser les paramètres de la projection, un ensemble de réglages sera disponible. Il s’agira très souvent de réglages pour la longitude, la latitude ou
  Khartis v3 - Cahier des charges 12
  encore la rotation. Un bouton permettra de réinitialiser ces réglages avec les valeurs par défaut, qui seront fournies par l’Atelier de cartographie.
  Les changements liés à ces réglages devront apparaître simultanément sur la carte. Ces derniers pouvant affecter les performances de l’outil, un aperçu simplifié pourra être activé automatiquement ou au choix par l’utilisateur afin de fluidifier ce paramétrage. Cet aperçu simplifié sera défini par le masquage des visualisations et un rendu graphique permettant d'optimiser les performances.
  �� L’équipe de l’Atelier de cartographie apportera son expertise pour le développement de cette fonctionnalité.
  En cas de collection de cartes (cf. 2.B.4.e. Collection), la même projection et les mêmes paramètres seront appliqués à toutes les cartes.
  2.B.4.d. Simplification (généralisation)
  La simplification ou généralisation d’une carte consiste à réduire ses détails pour faciliter sa lecture, notamment à une plus petite échelle, ou pour obtenir un design particulier. Concrètement, il s’agira de réduire le nombre de nœuds qui dessinent les polygones.
  Les fonds de carte du catalogue pourront être simplifiés selon trois niveaux prédéfinis : faible, moyen et élevé. Chacun de ces niveaux pointera en réalité un fichier lié à ce niveau de détails et chacun de ces fichiers sera mis à disposition par l’Atelier de cartographie.
  Les fonds de cartes importés par l’utilisateur pourront quant à eux être simplifiés avec un taux de simplification défini par l’utilisateur. Un avertissement préviendra du risque de suppression de certaines entités (polygones) dû à la simplification.
  Les fonds de carte OpenStreetMap ne pourront pas être simplifiés pour des raisons techniques.
  Dans le cas où plusieurs fichiers géographiques seraient chargés, il sera possible de sélectionner chacun des fichiers pour définir la simplification.
  En cas de collection de cartes (cf. point suivant), la même simplification sera appliquée à toutes les cartes.
  �� L’équipe de l’Atelier de cartographie apportera son expertise pour le développement de cette fonctionnalité.
  2.B.4.e. Collection
  Une collection de cartes est un ensemble de cartes partageant les mêmes données, permettant alors d’analyser et de comparer celle-ci. Dans le champ de la datavisualisation, on parle de “facettes” ou de “small multiples”.
  Pour créer une collection de cartes, il faudra paramétrer une visualisation en choisissant plusieurs variables pour faire varier une même primitive graphique. Dans la liste déroulante permettant de choisir une variable, un bouton permettra de créer une collection de cartes et de sélectionner plusieurs variables. Chacune de ces variables sera reliée à une carte de la collection.
  La création d’une collection de cartes aura un impact sur les paramètres de la visualisation car les principes d’échelle commune ou d’échelle propre seront possibles. Ces paramètres seront détaillés dans des ressources annexes.
  Une pastille en guise de notification apparaîtra sur l’icône de cet outil “collections” pour inciter l’utilisateur à l’ouvrir et à choisir ses paramètres.
  Les paramètres de l’outil permettront de choisir la disposition des cartes en précisant un nombre de colonnes sur lesquelles seront distribuées les cartes. Les paramètres permettront aussi de distribuer les variables visualisées selon les différentes cartes de la collection.
  Khartis v3 - Cahier des charges 13
  2.C. Habillage
  L’habillage d’une carte désigne l'ensemble des éléments ajoutés pour la rendre lisible et plus informative comme le titre, la légende, les sources, l'échelle, ou encore l’orientation. Ces éléments qui facilitent l'interprétation et la compréhension des informations géographiques représentées pourront être ajoutés/personnalisés à cette étape du parcours utilisateur. Des fonctionnalités de mise en page seront également présentes et regroupées à cette étape.
  2.C.1. Habillage prédéfini
  Dès lors qu’une visualisation sera créée, sa légende apparaîtra automatiquement (cf. 2.B.2.e. Légende de la visualisation). La légende sera le seul élément d’habillage visible avant que l’utilisateur n’atteigne l’étape Habillage.
  Lorsque l’utilisateur arrive à l’étape Habillage, des textes prédéfinis s’afficheront sur la page. Il s’agira d’un titre, d’un sous-titre, d’une source, de la source du fond de carte, de la signature et d’une mention “Réalisé avec Khartis”.
  Le titre, le sous-titre, la source et la signature ne pouvant être définis automatiquement, ces zones de texte s’afficheront sous la forme de placeholder incitant donc l'utilisateur à les remplir. Dans le cas où ces zones de texte resteraient vierges, ces dernières seraient invisibles sur l’image exportée.
  Chacun de ces éléments sera déplaçable, supprimable et adoptera un style par défaut qui sera personnalisable via l’outil annotation (cf. 2.C.2.d. Annotations).
  2.C.2. Outils d’habillage
  Tout au long de l’étape d’habillage, l’utilisateur aura à disposition des outils pour l’aider à enrichir et personnaliser sa carte.
  2.C.2.a. Format
  Cet outil permettra à l’utilisateur de sélectionner un format de page prédéfini parmi une liste restreinte qui sera fournie par l’Atelier de cartographie. Dans le cas où cette liste ne serait pas suffisante, il sera possible de personnaliser le format avec des valeurs en pixels.
  Au changement de dimensions de la page, tous les éléments seront automatiquement redistribué sur la page en respectant une composition facilitant la lecture, à savoir le titre et sous-titre au coin supérieur gauche, la ou les cartes au centre, la légende, si besoin superposée au bas de la carte et la source, précision du fond de carte, signature et crédit au coin inférieur droit.
  La couleur de la page sera personnalisable dans cet outil, tout comme l’ajout de marges et le choix d’afficher ou non une grille d’aide à l’alignement, si possible avec magnétisme, qui sera affichée par défaut uniquement à l’étape d’habillage.
  2.C.2.b. Légende
  Cet outil permettra d’éditer le contenu des légendes et de personnaliser le style.
  Chaque légende pourra être affichée/masquée. Le titre, le sous-titre pourront être précisés et l’ajout d’une note sera également possible.
  L’icône de cet outil affichera une pastille jusqu’à ce que l’utilisateur ouvre l’outil, de manière à l’inciter à personnaliser la légende.
  �� Cet algorithme sera fourni par l’équipe de l’Atelier de cartographie.
  Le style des légendes pourra être modifié en changeant la police, en précisant la taille (maximum) et la couleur des textes. La liste des polices disponibles sera restreinte et sera fournie par l’Atelier de cartographie.
  Khartis v3 - Cahier des charges 14
  Une option pour ajouter un arrière-plan sera également présente, ou l’utilisateur pourra préciser la couleur et le niveau d’opacité.
  Afin d’obtenir un rendu harmonieux, les modifications seront apportées à toutes les légendes.
  2.C.2.c. Indications géographiques
  Cet outil permettra l’ajout d’une échelle, de l’orientation et d’une carte en encart.
  L’échelle sera personnalisable avec un choix de formes prédéfinies (ligne ou boîte). Une distance figurée, l’unité et la couleur de l’élément pourront être précisées par l’utilisateur.
  L’orientation pourra être représentée par une flèche ou une rose des vents et sa taille ainsi que sa couleur pourront être indiquées.
  La carte en encart est une petite carte insérée dans la carte principale pour montrer un agrandissement d'une zone spécifique, situer la région dans un contexte plus large, ou fournir des détails supplémentaires sans surcharger la carte principale. L’utilisateur pourra choisir sa représentation (globe ou planisphère), sa taille, la couleur de la fenêtre indiquant le cadrage géographique de la carte principale, et préciser les autres couleurs de l’encart (continents, mers et océans) avec une option permettant de réutiliser les couleurs du fond de carte de la carte principale. L’utilisateur pourra également choisir un niveau de zoom et changer le centrage de cette carte en encart.
  �� L’équipe de l’Atelier de cartographie apportera son expertise pour le développement de ces fonctionnalités.
  2.C.2.d. Annotations
  Cet outil permettra l’ajout de textes, de formes, de dessins et d’images. Chacun de ces éléments sont ancrés sur la page et non géolocalisés sur la carte.
  Texte
  En sélectionnant cet outil, l’utilisateur pourra placer une zone de texte sur la page, en lui attribuant un style prédéfini ou personnalisé. Le contenu de la zone de texte ajoutée pourra être défini au sein de ce même panneau.
  Lorsque l’utilisateur sélectionne une zone de texte sur la page, cet outil apparaîtra et il pourra alors modifier le contenu et le style, ou encore supprimer le texte sélectionné.
  Forme
  Cette fonctionnalité permettra d’ajouter une forme en sélectionnant celle-ci parmi une liste restreinte (flèche, ligne, rond, rectangle et triangle). Pour chacune de ces formes, des réglages permettront d’ajuster l’épaisseur d’un tracé, sa courbe, son pointillé ou encore sa couleur.
  Lorsqu’une forme sera sélectionnée, il sera possible de modifier ces réglages et de supprimer l’objet pointé.
  Dessin
  L’outil permettra de dessiner manuellement une ligne ou une zone (tracé fermé). L’épaisseur, le taux de lissage, la couleur (de contour et de fond) ou le pointillé du tracé pourront être précisés par l’utilisateur.
  Lorsqu’un dessin sera sélectionné, il sera possible de modifier ces réglages et de supprimer l’objet pointé.
  Image
  Khartis v3 - Cahier des charges 15
  Une image au format jpg ou png pourra être importée via cet outil. L’utilisateur pourra la placer librement sur la page et régler sa taille et son opacité.
  Lorsqu’une image sera sélectionnée, il sera possible de modifier ces réglages et de supprimer l’objet pointé.
  2.C.2.e. Déficiences visuelles
  Derrière cet outil se trouvera une simulation de daltonisme avec une sélection de filtres (protanopie, protanomalie deutéranopie, etc.). Cette liste sera fournie par l’Atelier de cartographie.
  Ces filtres ne feront que simuler un daltonisme, ils n’affecteront pas les couleurs à l’export de la carte.
  2.D. Téléchargement
  L’utilisateur pourra télécharger trois types de résultat : la carte réalisée, les données mobilisées et enfin le fichier projet. Ces téléchargements seront possibles via un bouton menu, présent à toutes les étapes du parcours utilisateur.
  2.D.1. Carte
  Le document contenant la carte et sa mise en page sera téléchargeable dans différents formats standards, bitmap et vectoriel.
  L’export en image bitmap (ou matricielle) se fera en haute résolution au format jpg.
  L’export en fichier vectoriel se fera au format svg. Cet export devra comporter des calques organisés selon les différents éléments sur la page et de visualisations.
  2.D.2. Données
  Les données importées par l’utilisateur, potentiellement modifiées au sein de l’outil ou jointes à un fond de carte, pourront être téléchargées. L’utilisateur aura le choix de télécharger les données tabulaires ou le fichier géographique qu’il aura importé, le fond de carte utilisé, ou bien le résultat de la jointure entre les données importées et le fond de carte utilisé.
  2.D.2.a. Données tabulaires
  Ces données seront téléchargeables au format csv, en comportant toutes les modifications faites par l’utilisateur au sein de l’outil.
  2.D.2.b. Fichiers géographiques
  Ces fichiers, initialement importés par l'utilisateur, pourront être téléchargés au format geojson, en comportant toutes les modifications faites par l’utilisateur au sein de l’outil.
  2.D.2.c. Données tabulaires jointes à un fichier géographique
  Les données tabulaires importées par l’utilisateur jointe à un fichier géographique tel qu’un fond de carte issu du catalogue de l’outil ou un fichier géographique importé par l’utilisateur pourront être téléchargées.
  Pour les fonds de cartes issus du catalogue de l’outil, les éventuelles couches additionnelles (cf. 2.B.3.a. Personnalisation d’un fond de carte du catalogue), ces couches ne seront pas téléchargeables.
  Khartis v3 - Cahier des charges 16
  2.D.3. Projet
  L’ensemble des opérations menées par l’utilisateur pourront être téléchargées dans un fichier projet. Celui-ci portera idéalement l’extension .kh et pourra par la suite être importé par l’utilisateur pour reprendre ou modifier un projet.
  2.E. Sauvegarde
  Chaque projet pourra être sauvegardé de deux manières différentes : par la sauvegarde automatique au sein du navigateur ou par la sauvegarde manuelle via le téléchargement d’un fichier projet par l’utilisateur.
  2.E.1. Sauvegarde automatique dans le navigateur
  À chaque action menée par l’utilisateur, le projet sera enregistré au sein du navigateur. Ces projets seront nommés par l’utilisateur, ou automatiquement avec incrémentation et différenciés par leur date de dernière modification.
  Ces sauvegardes seront rassemblées à l’écran d’accueil de l’outil et accessibles via un menu principal.
  Ces sauvegardes pourront également être dupliquées par l’utilisateur.
  2.E.2. Sauvegarde manuelle dans un fichier
  Chaque projet avec ses visualisations et ses paramètres pourra être sauvegardé et téléchargé par l’utilisateur (cf. 2.D.3. Projet). Il pourra par la suite être importé par l’utilisateur pour reprendre ou modifier un projet.
  2.F. Exemples introductifs
  Sur sa page d’accueil, l’outil proposera plusieurs projets comme exemples afin que l’utilisateur puisse les charger et découvrir les fonctionnalités de Khartis. Ces exemples contiendront des données de différentes natures, utiliseront des fonds de cartes du catalogue ou non et feront appel à divers types de visualisations.
  Les projets exemples seront présentés à l’aide de vignettes et filtrables selon des critères qui seront définis plus tard par l’équipe de l’Atelier de cartographie.
  2.G. Aide et pages annexes
  L’utilisateur bénéficiera d’une aide au sein et en dehors de l’outil. Dans l’outil, des courts textes d’accompagnement, de tooltips ou de liens renverront vers des sections précises de pages externes rassemblant toute l’aide de l’outil. Ce site externe sera conçu et développé par l’équipe de l’Atelier de cartographie.
  Les textes d’accompagnement concentrés dans l’outil seront probablement validés ou rédigés dans un second temps. Ils devront donc être facilement intégrables et modifiables par l’Atelier de cartographie.
  Les pages annexes telles que la page de destination (présentation de l’outil), ou les mentions légales seront entièrement conçues et réalisées par l’Atelier de cartographie.

3. SPÉCIFICATIONS TECHNIQUES
   3.A. Technologies envisagées
   L’Atelier de cartographie a sélectionné et utilisé des technologies bien identifiées pour répondre aux attentes de l’outil en matière de fonctionnalités et de performances. Ces choix visent
   Khartis v3 - Cahier des charges 17
   également à assurer une maintenabilité et une flexibilité, tout en permettant une autonomie accrue pour l’équipe de l’Atelier de cartographie.
   3.A.1. Gestion des données tabulaires et géographiques
   La gestion des données, incluant l’import, la manipulation et l’export, sera réalisée grâce à DuckDB et son extension SPATIAL, déployées dans leurs versions WASM. Cette solution permet de traiter efficacement des volumes importants de données directement dans le navigateur, optimisant ainsi les performances de l’outil sans dépendance serveur pour ces opérations.
   3.A.2. Rendu cartographique
   Le rendu cartographique sera assuré par Deck.gl, une bibliothèque spécialisée offrant des visualisations interactives performantes. Son intégration permettra de gérer efficacement les couches géographiques et les visualisations de données.
   3.A.3. Librairies JavaScript spécifiques
   Différentes librairies JavaScript seront mobilisées pour répondre à des besoins spécifiques :

- d3.js : notamment pour les projections cartographiques et les outils liés à l’habillage. - chroma.js : pour la personnalisation des palettes de couleurs, notamment les palettes séquentielles et divergentes.
- @Observablehq/Plot : pour la création de graphiques interactifs intégrés à l’outil. 3.A.4. Design system
  Le design system s’appuiera sur les composants du Carbon Design System développé par IBM (cf. 4.B. Design System). Il sera intégré via son implémentation compatible avec Svelte.
  3.A.5. Framework recommandé
  Le développement reposera sur SveltKit et, si possible, sur Svelte 5 en mode Runes. Ce choix est fortement conseillé car Svelte est déjà utilisé dans d’autres projets de l’Atelier de cartographie, garantissant une expertise interne et facilitant l’évolution et la maintenance future de l’outil. Ce framework sera également employé pour les sites annexes (page de destination et d’aide). Cependant, des propositions alternatives de frameworks pourront être examinées, à condition qu’elles soient rigoureusement justifiées.
  3.A.6. Internationalisation (i18n)
  Paraglide JS est une piste envisagée pour répondre à l’internationalisation de l’outil, bien qu’elle reste à confirmer en fonction des tests de faisabilité et de compatibilité avec les autres technologies.
  3.A.7. Mobilisation des technologies
  Certaines technologies seront exploitées de manière indirecte. Par exemple, Duck DB sera utilisé à travers une surcouche JavaScript développée par l’Atelier de cartographie, intégrant des méthodes adaptées aux besoins spécifiques de Khartis. En revanche, la gestion des couches cartographiques avec Deck.gl sera confiée au prestataire.
  Khartis v3 - Cahier des charges 18
  3.B. Performances
  Le chargement des différentes pages devra être rapide, en respectant les normes actuelles de performances web. En particulier, le chargement des premières pages, où les librairies et technologies, telles que DuckDB, seront chargées à ce moment.
  Pour les opérations susceptibles de durer plus longtemps, l’outil devra intégrer des écrans squelettes ou afficher des loaders appropriés pour réduire la perception du temps d’attente. À noter que le design system utilisé pour cet outil comprend des squelettes pour chaque composant.
  3.C. Compatibilité
  L’outil devra être compatible avec les principaux navigateurs web tels que Google Chrome, Mozilla Firefox, Microsoft Edge et Safari. L’outil doit également fonctionner sur les versions mobiles de ces navigateurs.
  3.D. Responsive design
  L’outil devra offrir une expérience utilisateur optimale sur tous les types de dispositifs, qu’il s’agisse d’ordinateurs, de tablettes ou de smartphones. L’outil devra s’adapter automatiquement aux différentes tailles d’écran et orientations des dispositifs, en suivant les interfaces définies par l’équipe de l’Atelier de cartographie.
  3.E. Accessibilité
  L’outil devra garantir une utilisation par le plus grand nombre, y compris les personnes en situation de handicap. L’outil devra notamment être conçu en conformité avec les normes du Référentiel Général d’Amélioration de l’Accessibilité (RGAA) pour assurer un certain niveau d’accessibilité. Cela inclut l’adaptation des couleurs et contrastes pour les personnes malvoyantes, en conformité avec les interfaces définies par l’Atelier de cartographie et le design system, lui-même compatible avec ces normes. L’outil laissera aussi la possibilité de naviguer à l’aide du clavier pour les utilisateurs ayant des difficultés motrices.
  Bien que l’outil vise à respecter les normes d’accessibilité telles que le RGAA, il est important de reconnaître que certaines contraintes inhérentes à la visualisation de données peuvent limiter l’accessibilité totale. Par exemple, les cartes et visualisations ne pourront pas être décrites à 100% pour les utilisateurs de lecteurs d’écran ou pour ceux ayant des déficiences visuelles sévères.
  3.F. Raccourcis clavier
  Outre les questions d’accessibilité, l’outil devra comporter des raccourcis clavier permettant aussi aux utilisateurs d’accéder rapidement à certains modules. Chaque étape du parcours utilisateur (données, visualisations, habillages) et chaque outil présent dans ces étapes possédera un raccourci clavier.
  La touche échap du clavier permettra également d’annuler une action ou fermer un panneau ouvert.
  La liste des raccourcis clavier sera définie et fournie par l’Atelier de cartographie. 3.G. Multilinguisme
  L’outil sera disponible en deux langues : en français et en anglais. La saisie des traductions devra suivre une méthode flexible permettant à l’Atelier de cartographie de fournir des traductions dans un second temps. Le choix de la langue par défaut sera choisi automatiquement en fonction de ses
  Khartis v3 - Cahier des charges 19
  préférences système ou celles de son navigateur. Le changement sera possible via le menu principal de l’outil.
  L’outil devra être compatible avec les modules de traduction automatique présents dans les navigateurs web, assurant que tous les textes de l’outil puissent être traduits dynamiquement pour les utilisateurs qui préfèrent d’autres langues.
  3.H. Analyse d’audience
  L’outil devra permettre un suivi de l’audience via une solution telle que Google Analytics. L’intégration permettra de collecter des données sur l’utilisation de l’outil, sur le comportement des utilisateurs et sur les interactions avec les différentes fonctionnalités.
  3.I. Sécurité et protection des données
  Les données importées par les utilisateurs pour réaliser des visualisations (données tabulaires et fichiers géographiques) resteront confinées dans le navigateur de l’utilisateur et ne seront pas transmises à des serveurs externes, assurant alors une utilisation sécurisée et privée de l’outil.
  Sciences Po collectera des données telles que les cookies, les données de navigation et les informations reçues via d’éventuels formulaires de contact. Ces données seront traitées conformément aux réglementations RGPD.
  3.J. Hébergement
  L’outil sera hébergé sur les serveurs de Sciences Po, pour garantir la stabilité, la sécurité et la performance de l’outil. Une option d’hébergement externe est attendue.
  Le code source de l’outil sera également disponible sur GitHub, sous l’organisation de l’Atelier de cartographie, dans un dépôt propre à Khartis v3. Ce dépôt permettra ainsi une transparence totale, des potentielles contributions de la part de la communauté des développeurs. Le dépôt sera privé le temps du développement et sera ouvert lors de la sortie de cette nouvelle version de l’outil.
  3.K. Licence
  L’outil sera publié sous la licence MIT. Cette licence open-source permissive permet à quiconque d’utiliser, copier, modifier, fusionner, publier, distribuer et/ou vendre des copies de l’outil. Elle impose toutefois que toute copie ou distribution du logiciel inclut une copie de la licence MIT et de la notice du copyright.
  Le copyright sera le suivant : © Atelier de cartographie / Sciences Po, 2025

4. INTÉGRATION DE LA CONCEPTION UI/UX
   L’ensemble de la conception UI/UX a été définie finement par l’équipe de l’Atelier de cartographie, basé notamment sur un design system éprouvé. Cependant, des propositions d’alternatives de la part du prestataire, notamment des changements mineurs sur l’interface pourront être examinées par l’Atelier de cartographie.
   4.A. Parcours utilisateur
   À l’ouverture de l’outil, trois entrées seront proposées à l’utilisateur : créer un nouveau projet, ouvrir un projet ou une sauvegarde, ou bien essayer avec un exemple. Le parcours utilisateur sera ensuite divisé en trois grandes étapes : données, visualisations, habillage.
   Khartis v3 - Cahier des charges 20
   Bien que ces étapes suivent la chaîne de traitement pour la réalisation d’une carte thématique et évoquent un processus linéaire, l’utilisateur pourra naviguer librement entre ces étapes, sans avoir à suivre un chemin prédéfini et contraint.
   Une représentation simplifiée du parcours utilisateur est disponible sur le fichier Figma suivant Khartis - Parcours utilisateur .
   L’ensemble du parcours utilisateur et son contenu est représenté et détaillé sur les maquettes qui seront livrées au prestataire (cf. 4.D. Maquettes).
   4.A.1. Étape Données
   Cette étape a pour particularité d’avoir un parcours utilisateur légèrement différent selon la nature des données importées, s’il s’agit de données tabulaires ou de fichier géographique.
   Lors d’un import de données tabulaires, trois grandes sections structureront l’étape Données : 1. Contrôler les données, 2. Géolocaliser les données et 3. Joindre les données à un fond de carte.
   Lors d’un import de fichier géographique, deux grandes sections organiseront l’étape Données : 1. Contrôler les données et 2. Enrichir les données. Cette dernière section, facultative, permettra de joindre des données tabulaires ou de superposer le fichier géographique à un fond de carte.
   4.A.2. Étape Visualisations
   Cette étape sera divisée en trois sections : 1. Choisir ou créer une visualisation, 2. Paramétrer la visualisation, 3. Personnaliser le fond de carte.
   Tout au long de cette étape, cinq outils seront à la disposition de l’utilisateur, accessible depuis une barre d’outils (cf. 2.B.4. Outils de visualisation et 4.C.2. Barre d’outils).
   4.A.3. Étape Habillage
   Cette étape n’aura pas de structure contrairement aux deux étapes précédentes. L’utilisateur sera libre d’utiliser ou non les outils proposés dans la barre d'outils ou d’agir directement sur les éléments d’habillage présents sur la carte.
   4.A.4. Télécharger
   La fin du parcours utilisateur sera matérialisée par le téléchargement de sa carte et/ou ses données (cf. 2.D. Téléchargement).
   4.B. Design System
   L’interface de l’outil a été conçue à partir d’un design system afin de garantir la cohérence et l’uniformité visuelle à travers toute l’application, facilitant ainsi la maintenance, l’évolution de l’outil, tout en améliorant l’expérience utilisateur. Le choix s’est porté sur Carbon Design System d’IBM pour ses nombreux composants et sa documentation complète.
   Ces composants ont été graphiquement personnalisés pour correspondre au mieux à la charte graphique de Sciences Po. D’autres ont été créés de toutes pièces pour répondre aux besoins et fonctionnalités de l’outil.
   Un ensemble de fichiers Figma sera mis à disposition du prestataire pour faciliter l’intégration de la conception UI/UX.
   4.C. Structure de l’interface
   L’interface de l’outil est décomposée en quatre parties : l’en-tête, la barre d’outils, le panneau latéral et la visionneuse. Des fenêtres modales s’ajouteront parfois à cette interface pour des actions particulières.
   Khartis v3 - Cahier des charges 21
   Figure 1 : Aperçu de l’interface sur écran large (desktop) et écran de mobile
   4.C.1. En-tête
   Un bandeau supérieur en en-tête rassemblera trois éléments : un menu principal, le nom du projet en cours et un ensemble de boutons permettant l’accès à l’aide et au téléchargement.
   À noter que sur un écran de mobile, l’en-tête sera graphiquement simplifié.
   Les contenus du menu principal et du bouton menu de téléchargement seront fournis via les maquettes et/ou des ressources annexes.
   4.C.2. Barre d’outils
   Une barre d’outils rassemblera trois boutons principaux permettant de naviguer entre les trois grandes étapes du parcours utilisateur (cf. 4.A. Parcours utilisateur) dont les contenus seront développés dans le panneau latéral (cf. point suivant).
   Les outils disponibles pour les étapes Visualisations et Habillage seront accessibles depuis cette barre avec des panneaux déportés permettant d’accéder aux contenus des outils.
   Sur un écran large (ordinateur ou tablette), la barre d’outils sera présente sur la gauche de l’écran. Sur un écran mobile, elle sera présente au bas de l’écran.
   4.C.3. Panneau latéral
   Un panneau latéral rassemblera l’ensemble des contenus des étapes Données et Visualisations. Ce panneau sera affiché par défaut et pourra être masqué par l’utilisateur pour laisser davantage de place à la visionneuse (cf. point suivant). Pour l’étape Données, la taille de ce panneau pourra être agrandie ou réduite.
   Le panneau latéral contiendra des onglets pour chaque données importées ou visualisations créées.
   Un fil d’ariane sera présent au bas du panneau pour indiquer la progression de l’utilisateur et donner des raccourcis vers les sections des étapes.
   Pour certains réglages secondaires, des panneaux déportés, liés à ce panneau latéral pourront être déployés.
   Khartis v3 - Cahier des charges 22
   4.C.4. Visionneuse
   La page et la ou les cartes seront représentées au sein d’une visionneuse. Un outil de zoom permettra d’agir sur cette visionneuse avec une distinction possible entre la carte et la page (cf. 2.A.9.c. Zoom). Des infobulles apparaîtront au-dessus de la visionneuse, à un emplacement fixe, pour afficher les données liées à la carte (cf. 2.A.9.a. Infobulles).
   4.C.5. Fenêtre modale
   À l’ouverture de l’outil ou pour des actions particulières telles que l’import de nouvelles données ou des réinitialisations, des fenêtres modales s’afficheront au-dessus de l’interface de façon à limiter les actions possibles par l’utilisateur.
   4.D. Maquettes
   Un fichier Figma rassemblera les composants personnalisés du design system, la structure de l’interface, ses différents contenus et réglages possibles. Ce même fichier contiendra un prototype interactif de l’outil permettant de tester le parcours utilisateur et d’avoir un aperçu exhaustif de l’outil.

Figure 2 : Aperçu de la page d’accueil sur écran large (desktop)

Figure 3 : Aperçu de l’étape Données sur écran large (desktop)
Khartis v3 - Cahier des charges 23

Figure 4 : Aperçu de l’étape Visualisations sur écran large (desktop)

Figure 5 : Aperçu de l’étape Habillage sur écran large (desktop)

Khartis v3 - Cahier des charges 24

Figure 6 : Aperçus des différentes étapes sur écran de mobile 5. DÉPLOIEMENT, MAINTENANCE ET ÉVOLUTION
5.A. Environnement de déploiement
L’environnement de déploiement sera soumis aux spécifications de Sciences Po concernant la configuration du serveur. Le processus de mise en production devra suivre un parcours structuré incluant des étapes de validation et de tests.
Deux environnements seront distingués : un environnement de préproduction et un environnement de production. L’environnement de préprod sera utilisé pour les tests finaux et les validations avant la mise en production, afin de garantir que toutes les fonctionnalités soient opérationnelles et conformes aux attentes. La mise en production ne pourra être effectuée qu’après validation complète en environnement de préprod, suivant un processus de déploiement versionné et documenté.
5.B. Documentation du code
Une documentation détaillée, incluant des commentaires de code clairs et précis, des guides d’utilisation, des instructions d’installation ou encore des exemples de cas d’utilisation devra être apportée par le prestataire. Cette documentation devra être déposée et maintenue sur la plateforme GitHub, afin de garantir un accès facile et transparent pour tous les participants au projet ainsi que les éventuels futurs contributeurs.
5.C. Maintenance
Les maintenance évolutive et corrective interviendront à partir de 2026, après la mise en production de l’outil. 6. GESTION DE PROJET ET CALENDRIER
6.A. Contrat et mode opératoire
Le mode au forfait est envisagé. Avec la possibilité d’interagir, de répondre aux questions selon des itérations (phases de test et le processus de validation)
Khartis v3 - Cahier des charges 25
6.B. Ressources
Les principaux interlocuteurs du prestataire seront les membres de l’Atelier de cartographie de Sciences Po. Parmi eux, Thomas Ansart, qui se concentrera davantage sur les spécifications techniques et Antoine Rio, qui sera particulièrement orienté vers l'intégration de la conception UI/UX. Patrice Mitrano et Benoît Martin seront également disponibles, principalement pour les spécifications fonctionnelles et le suivi du projet.
Quelques membres de la DSI de Sciences Po seront accessibles pour des points techniques particuliers concernant le déploiement de l’outil.
Comme évoqué tout au long de ce cahier des charges, des ressources annexes, telles que des algorithmes, des maquettes, des listes de réglages, etc. seront mises à disposition du prestataire pour faciliter le développement de l’outil.
6.C. Calendrier
La mise en production est attendue pour fin novembre 2025 ou début décembre.
6.D. Clauses de confidentialité
Le contenu du cahier des charges est strictement confidentiel et ne doit être divulgué à aucune tierce partie. Le prestataire s’engage à maintenir la confidentialité de toutes les informations liées au projet tout au long de la phase de développement. Toute violation de cette clause entraînera des conséquences juridiques conformément aux accords de confidentialité établis. 7. RÉPONSE ATTENDUE
La réponse devra comprendre :

- une présentation de la structure du candidat et les participants au développement.. - un chiffrage détaillé comprenant un prix ferme pour le développement et des options pour la TMA et l’hébergement.
- des références et exemples de réalisations similaires.
  Le prestataire donnera sa proposition avant le 18 avril 2025 à 10 heures, soit 4 semaines après la réception de ce cahier des charges.
  Le prestataire enverra sa proposition à :
- Patrice Mitrano (Atelier de cartographie, Sciences Po) , patrice.mitrano@sciencespo.fr - Olivier Pouchard (DSI, Sciences Po), olivier.pouchard@sciencespo.fr
  Khartis v3 - Cahier des charges 26
