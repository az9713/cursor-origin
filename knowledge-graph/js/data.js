/* History of computing knowledge graph — generated dataset (~350 nodes) */
(function () {
  'use strict';

  var TYPES = ['person', 'company', 'technology', 'event', 'concept'];

  var SEEDS = [
    { id: 'babbage', label: 'Charles Babbage', type: 'person', year: 1791, summary: 'Designed the Analytical Engine, a mechanical general-purpose computer concept.', tags: ['victorian', 'hardware'] },
    { id: 'lovelace', label: 'Ada Lovelace', type: 'person', year: 1815, summary: 'Wrote notes on the Analytical Engine; often cited as the first programmer.', tags: ['victorian', 'programming'] },
    { id: 'analytical-engine', label: 'Analytical Engine', type: 'technology', year: 1837, summary: 'Mechanical programmable computer design with store, mill, and punched cards.', tags: ['hardware', 'victorian'] },
    { id: 'hollerith', label: 'Herman Hollerith', type: 'person', year: 1860, summary: 'Invented punched-card tabulating machines for the 1890 U.S. census.', tags: ['census', 'hardware'] },
    { id: 'ibm', label: 'IBM', type: 'company', year: 1911, summary: 'Global computing giant rooted in tabulating machines and mainframes.', tags: ['mainframe', 'enterprise'] },
    { id: 'eniac', label: 'ENIAC', type: 'technology', year: 1945, summary: 'First general-purpose electronic digital computer in the U.S.', tags: ['hardware', 'wwii'] },
    { id: 'mauchly', label: 'John Mauchly', type: 'person', year: 1907, summary: 'Co-designed ENIAC with J. Presper Eckert at Penn.', tags: ['eniac', 'hardware'] },
    { id: 'eckert', label: 'J. Presper Eckert', type: 'person', year: 1919, summary: 'Co-inventor of ENIAC and early stored-program machines.', tags: ['eniac', 'hardware'] },
    { id: 'turing', label: 'Alan Turing', type: 'person', year: 1912, summary: 'Formalized computation with the Turing machine; broke Enigma at Bletchley.', tags: ['theory', 'crypto'] },
    { id: 'turing-machine', label: 'Turing Machine', type: 'concept', year: 1936, summary: 'Abstract model of computation defining what is computable.', tags: ['theory', 'foundations'] },
    { id: 'von-neumann', label: 'John von Neumann', type: 'person', year: 1903, summary: 'Architect of stored-program computer design used for decades.', tags: ['architecture', 'theory'] },
    { id: 'stored-program', label: 'Stored-Program Architecture', type: 'concept', year: 1945, summary: 'Programs and data share the same memory; fetch-decode-execute cycle.', tags: ['architecture', 'foundations'] },
    { id: 'edsac', label: 'EDSAC', type: 'technology', year: 1949, summary: 'First practical stored-program computer at Cambridge.', tags: ['hardware', 'uk'] },
    { id: 'grace-hopper', label: 'Grace Hopper', type: 'person', year: 1906, summary: 'Pioneer of compilers and COBOL; coined "debugging".', tags: ['programming', 'navy'] },
    { id: 'cobol', label: 'COBOL', type: 'technology', year: 1959, summary: 'Business-oriented language still running critical systems.', tags: ['language', 'enterprise'] },
    { id: 'fortran', label: 'FORTRAN', type: 'technology', year: 1957, summary: 'First widely used high-level language for scientific computing.', tags: ['language', 'science'] },
    { id: 'lisp', label: 'Lisp', type: 'technology', year: 1958, summary: 'Functional language from MIT; ancestor of AI research stacks.', tags: ['language', 'ai'] },
    { id: 'unix', label: 'Unix', type: 'technology', year: 1969, summary: 'Portable multi-user OS from Bell Labs; shaped modern computing.', tags: ['os', 'bell-labs'] },
    { id: 'c-language', label: 'C', type: 'technology', year: 1972, summary: 'Systems language used to rewrite Unix and countless platforms.', tags: ['language', 'systems'] },
    { id: 'ken-thompson', label: 'Ken Thompson', type: 'person', year: 1943, summary: 'Co-created Unix and the B language; Go co-author.', tags: ['unix', 'systems'] },
    { id: 'dennis-ritchie', label: 'Dennis Ritchie', type: 'person', year: 1941, summary: 'Created C and co-developed Unix at Bell Labs.', tags: ['unix', 'c'] },
    { id: 'arpanet', label: 'ARPANET', type: 'technology', year: 1969, summary: 'U.S. research network that evolved into the Internet.', tags: ['networking', 'darpa'] },
    { id: 'internet-born', label: 'Internet Goes Live', type: 'event', year: 1969, summary: 'First ARPANET node-to-node message sent between UCLA and SRI.', tags: ['networking', 'milestone'] },
    { id: 'tcp-ip', label: 'TCP/IP', type: 'technology', year: 1974, summary: 'Packet-switched protocol suite underpinning the Internet.', tags: ['networking', 'protocol'] },
    { id: 'cerf', label: 'Vint Cerf', type: 'person', year: 1943, summary: 'Co-designed TCP/IP; often called a father of the Internet.', tags: ['networking', 'protocol'] },
    { id: 'kahn', label: 'Bob Kahn', type: 'person', year: 1938, summary: 'Co-inventor of TCP/IP and early Internet architecture.', tags: ['networking', 'darpa'] },
    { id: 'xerox-parc', label: 'Xerox PARC', type: 'company', year: 1970, summary: 'Lab that pioneered GUI, Ethernet, laser printing, and mice.', tags: ['research', 'gui'] },
    { id: 'smalltalk', label: 'Smalltalk', type: 'technology', year: 1972, summary: 'Object-oriented language and environment at Xerox PARC.', tags: ['language', 'oop'] },
    { id: 'alto', label: 'Xerox Alto', type: 'technology', year: 1973, summary: 'Personal workstation with bitmap GUI that inspired later PCs.', tags: ['hardware', 'gui'] },
    { id: 'apple', label: 'Apple', type: 'company', year: 1976, summary: 'Personal computing company behind Macintosh, iPhone, and more.', tags: ['consumer', 'hardware'] },
    { id: 'jobs', label: 'Steve Jobs', type: 'person', year: 1955, summary: 'Co-founded Apple; drove design-forward personal computing.', tags: ['apple', 'design'] },
    { id: 'wozniak', label: 'Steve Wozniak', type: 'person', year: 1950, summary: 'Engineered the Apple I and Apple II.', tags: ['apple', 'hardware'] },
    { id: 'microsoft', label: 'Microsoft', type: 'company', year: 1975, summary: 'Software giant behind Windows, Office, and Azure.', tags: ['software', 'enterprise'] },
    { id: 'gates', label: 'Bill Gates', type: 'person', year: 1955, summary: 'Co-founded Microsoft; championed PC software platform.', tags: ['microsoft', 'business'] },
    { id: 'altair', label: 'Altair 8800', type: 'technology', year: 1975, summary: 'Kit microcomputer that sparked the hobbyist PC revolution.', tags: ['hardware', 'hobbyist'] },
    { id: 'basic-ms', label: 'Microsoft BASIC', type: 'technology', year: 1975, summary: 'Early Microsoft product for the Altair 8800.', tags: ['language', 'microsoft'] },
    { id: 'ibm-pc', label: 'IBM PC', type: 'technology', year: 1981, summary: 'Open architecture PC that standardized the industry.', tags: ['hardware', 'pc'] },
    { id: 'dos', label: 'MS-DOS', type: 'technology', year: 1981, summary: 'Disk operating system bundled with early IBM PCs.', tags: ['os', 'microsoft'] },
    { id: 'macintosh', label: 'Macintosh', type: 'technology', year: 1984, summary: 'Mass-market GUI computer launched with the "1984" ad.', tags: ['hardware', 'gui'] },
    { id: 'mac-launch', label: 'Macintosh Launch', type: 'event', year: 1984, summary: 'Apple unveils Macintosh, bringing GUI to mainstream users.', tags: ['apple', 'milestone'] },
    { id: 'windows-1', label: 'Windows 1.0', type: 'technology', year: 1985, summary: 'Microsoft graphical shell for MS-DOS.', tags: ['os', 'gui'] },
    { id: 'gnu', label: 'GNU Project', type: 'concept', year: 1983, summary: 'Free-software movement to build a Unix-like OS.', tags: ['opensource', 'unix'] },
    { id: 'stallman', label: 'Richard Stallman', type: 'person', year: 1953, summary: 'Founded GNU and the free software movement.', tags: ['opensource', 'ethics'] },
    { id: 'linux', label: 'Linux', type: 'technology', year: 1991, summary: 'Unix-like kernel powering servers, Android, and cloud.', tags: ['os', 'opensource'] },
    { id: 'torvalds', label: 'Linus Torvalds', type: 'person', year: 1969, summary: 'Created Linux and Git.', tags: ['linux', 'git'] },
    { id: 'www', label: 'World Wide Web', type: 'technology', year: 1989, summary: 'Hypertext system of URLs, HTML, and HTTP.', tags: ['web', 'hypertext'] },
    { id: 'berners-lee', label: 'Tim Berners-Lee', type: 'person', year: 1955, summary: 'Invented the Web at CERN; founded W3C.', tags: ['web', 'cern'] },
    { id: 'html', label: 'HTML', type: 'technology', year: 1991, summary: 'Markup language for documents on the Web.', tags: ['web', 'markup'] },
    { id: 'http', label: 'HTTP', type: 'technology', year: 1991, summary: 'Application protocol for transferring hypertext.', tags: ['web', 'protocol'] },
    { id: 'mosaic', label: 'Mosaic Browser', type: 'technology', year: 1993, summary: 'First popular graphical web browser.', tags: ['web', 'browser'] },
    { id: 'netscape', label: 'Netscape', type: 'company', year: 1994, summary: 'Early browser company; Netscape IPO fueled dot-com boom.', tags: ['web', 'browser'] },
    { id: 'google', label: 'Google', type: 'company', year: 1998, summary: 'Search and cloud giant; Android, Chrome, AI research.', tags: ['web', 'search'] },
    { id: 'page-brin', label: 'Larry Page & Sergey Brin', type: 'person', year: 1973, summary: 'Co-founded Google; PageRank changed web search.', tags: ['google', 'search'] },
    { id: 'amazon', label: 'Amazon', type: 'company', year: 1994, summary: 'E-commerce leader; AWS dominates cloud infrastructure.', tags: ['cloud', 'retail'] },
    { id: 'aws', label: 'Amazon Web Services', type: 'technology', year: 2006, summary: 'Pioneering public cloud platform (EC2, S3).', tags: ['cloud', 'infrastructure'] },
    { id: 'smartphone-era', label: 'Smartphone Era', type: 'event', year: 2007, summary: 'iPhone launch redefined mobile computing and app ecosystems.', tags: ['mobile', 'milestone'] },
    { id: 'iphone', label: 'iPhone', type: 'technology', year: 2007, summary: 'Multi-touch smartphone that merged phone, media, and web.', tags: ['mobile', 'hardware'] },
    { id: 'android', label: 'Android', type: 'technology', year: 2008, summary: 'Open mobile OS acquired by Google; largest phone share.', tags: ['mobile', 'os'] },
    { id: 'openai', label: 'OpenAI', type: 'company', year: 2015, summary: 'AI research lab behind GPT models and ChatGPT.', tags: ['ai', 'research'] },
    { id: 'transformers', label: 'Transformer Architecture', type: 'concept', year: 2017, summary: 'Attention-based neural architecture powering modern LLMs.', tags: ['ai', 'ml'] },
    { id: 'chatgpt-launch', label: 'ChatGPT Launch', type: 'event', year: 2022, summary: 'Consumer LLM chat interface went viral worldwide.', tags: ['ai', 'milestone'] },
    { id: 'bitcoin', label: 'Bitcoin', type: 'technology', year: 2009, summary: 'First decentralized cryptocurrency using proof-of-work.', tags: ['crypto', 'blockchain'] },
    { id: 'blockchain', label: 'Blockchain', type: 'concept', year: 2008, summary: 'Distributed ledger secured by cryptographic chaining.', tags: ['crypto', 'distributed'] },
    { id: 'relational-db', label: 'Relational Database', type: 'concept', year: 1970, summary: 'Codd model: tables, relations, and declarative queries.', tags: ['data', 'theory'] },
    { id: 'codd', label: 'Edgar F. Codd', type: 'person', year: 1923, summary: 'IBM researcher who invented the relational model.', tags: ['data', 'ibm'] },
    { id: 'sql', label: 'SQL', type: 'technology', year: 1974, summary: 'Standard language for relational database queries.', tags: ['data', 'language'] },
    { id: 'oracle', label: 'Oracle', type: 'company', year: 1977, summary: 'Enterprise database and cloud applications vendor.', tags: ['data', 'enterprise'] },
    { id: 'mysql', label: 'MySQL', type: 'technology', year: 1995, summary: 'Popular open-source relational database.', tags: ['data', 'opensource'] },
    { id: 'postgres', label: 'PostgreSQL', type: 'technology', year: 1996, summary: 'Advanced open-source RDBMS with rich extensions.', tags: ['data', 'opensource'] },
    { id: 'moores-law', label: "Moore's Law", type: 'concept', year: 1965, summary: 'Observation that transistor density doubles ~every two years.', tags: ['hardware', 'silicon'] },
    { id: 'intel', label: 'Intel', type: 'company', year: 1968, summary: 'Microprocessor leader; x86 architecture dominance.', tags: ['silicon', 'hardware'] },
    { id: '4004', label: 'Intel 4004', type: 'technology', year: 1971, summary: 'First commercial microprocessor on a single chip.', tags: ['silicon', 'hardware'] },
    { id: 'nvidia', label: 'NVIDIA', type: 'company', year: 1993, summary: 'GPU pioneer; CUDA powers modern AI training.', tags: ['gpu', 'ai'] },
    { id: 'cuda', label: 'CUDA', type: 'technology', year: 2006, summary: 'Parallel computing platform for NVIDIA GPUs.', tags: ['gpu', 'parallel'] },
    { id: 'deep-learning', label: 'Deep Learning', type: 'concept', year: 2006, summary: 'Multi-layer neural networks trained on large datasets.', tags: ['ai', 'ml'] },
    { id: 'imagenet-moment', label: 'ImageNet Breakthrough', type: 'event', year: 2012, summary: 'AlexNet crushed image recognition benchmarks on GPUs.', tags: ['ai', 'milestone'] },
    { id: 'python-lang', label: 'Python', type: 'technology', year: 1991, summary: 'General-purpose language dominant in data science and AI.', tags: ['language', 'ai'] },
    { id: 'javascript', label: 'JavaScript', type: 'technology', year: 1995, summary: 'Scripting language of the Web; now full-stack.', tags: ['web', 'language'] },
    { id: 'nodejs', label: 'Node.js', type: 'technology', year: 2009, summary: 'JavaScript runtime enabling server-side and tooling ecosystems.', tags: ['web', 'runtime'] },
    { id: 'react', label: 'React', type: 'technology', year: 2013, summary: 'Component UI library from Facebook/Meta.', tags: ['web', 'frontend'] },
    { id: 'git', label: 'Git', type: 'technology', year: 2005, summary: 'Distributed version control system.', tags: ['devtools', 'opensource'] },
    { id: 'github', label: 'GitHub', type: 'company', year: 2008, summary: 'Social coding platform built on Git.', tags: ['devtools', 'opensource'] }
  ];

  var ERAS = [
    { name: 'Mechanical Age', start: 1800, end: 1940 },
    { name: 'Electronic Dawn', start: 1940, end: 1960 },
    { name: 'Mainframe Era', start: 1950, end: 1975 },
    { name: 'Minicomputer Wave', start: 1965, end: 1985 },
    { name: 'Personal Computing', start: 1975, end: 1995 },
    { name: 'Internet & Web', start: 1985, end: 2005 },
    { name: 'Mobile & Cloud', start: 2000, end: 2018 },
    { name: 'AI Renaissance', start: 2012, end: 2026 }
  ];

  var PERSON_FIRST = ['Ada', 'Alan', 'Grace', 'John', 'Mary', 'Ken', 'Linus', 'Tim', 'Vint', 'Bob', 'Edgar', 'Herman', 'Steve', 'Bill', 'Richard', 'Larry', 'Sergey', 'Margaret', 'Donald', 'Edsger', 'Barbara', 'Radia', 'Frances', 'Shafi', 'Whitfield', 'John', 'Jean', 'Katherine', 'Dorothy', 'Claude'];
  var PERSON_LAST = ['Turing', 'Hopper', 'Thompson', 'Ritchie', 'Cerf', 'Kahn', 'Knuth', 'Lovelace', 'Babbage', 'Diffie', 'Hellman', 'Shannon', 'Brooks', 'Kay', 'Engelbart', 'Hamilton', 'Johnson', 'Wilkes', 'Backus', 'McCarthy', 'Minsky', 'Newell', 'Simon', 'Dijkstra', 'Hoare', 'Wirth', 'Stroustrup', 'Gosling', 'Hejlsberg', 'van Rossum'];
  var COMPANY_SUFFIX = ['Labs', 'Systems', 'Computing', 'Dynamics', 'Networks', 'Micro', 'Digital', 'Research', 'Technologies', 'Works', 'Instruments', 'Semiconductor', 'Software', 'Data', 'Cloud'];
  var TECH_WORDS = ['Protocol', 'Kernel', 'Compiler', 'Cache', 'Bus', 'Chip', 'Stack', 'Frame', 'Packet', 'Router', 'Switch', 'Sensor', 'Display', 'Firmware', 'Hypervisor', 'Container', 'Cluster', 'Index', 'Queue', 'Pipeline'];
  var CONCEPT_WORDS = ['Abstraction', 'Recursion', 'Concurrency', 'Virtualization', 'Encapsulation', 'Polymorphism', 'Latency', 'Throughput', 'Fault Tolerance', 'Idempotency', 'Immutability', 'Determinism', 'Heuristic', 'Entropy', 'Complexity', 'Semantics', 'Syntax', 'Paradigm', 'Topology', 'Scalability'];

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function pick(arr, i) {
    return arr[i % arr.length];
  }

  function eraForYear(year) {
    for (var i = 0; i < ERAS.length; i++) {
      if (year >= ERAS[i].start && year <= ERAS[i].end) return ERAS[i].name;
    }
    return 'Computing History';
  }

  function buildNodes() {
    var nodes = SEEDS.slice();
    var seen = {};
    nodes.forEach(function (n) { seen[n.id] = true; });

    ERAS.forEach(function (era, ei) {
      var id = slug(era.name);
      if (!seen[id]) {
        nodes.push({
          id: id,
          label: era.name,
          type: 'event',
          year: era.start,
          summary: 'Historical era spanning ' + era.start + '–' + era.end + ' in computing.',
          tags: ['era', 'timeline']
        });
        seen[id] = true;
      }
    });

    var target = 350;
    var i = 0;
    while (nodes.length < target) {
      var year = 1820 + (i * 17) % 206;
      var era = eraForYear(year);
      var kind = i % 5;
      var node;

      if (kind === 0) {
        var fn = pick(PERSON_FIRST, i);
        var ln = pick(PERSON_LAST, i + 3);
        var label = fn + ' ' + ln;
        var pid = slug(label);
        if (seen[pid]) { i++; continue; }
        node = {
          id: pid,
          label: label,
          type: 'person',
          year: 1920 + (i % 70),
          summary: 'Researcher and engineer active during the ' + era + ', contributing to early ' + pick(['systems', 'languages', 'networks', 'theory'], i) + '.',
          tags: ['figure', slug(era)]
        };
      } else if (kind === 1) {
        var cname = pick(['Nova', 'Apex', 'Vector', 'Helix', 'Quantum', 'Binary', 'Cipher', 'Lattice', 'Prism', 'Orbit'], i) + ' ' + pick(COMPANY_SUFFIX, i);
        var cid = slug(cname);
        if (seen[cid]) { i++; continue; }
        node = {
          id: cid,
          label: cname,
          type: 'company',
          year: year,
          summary: cname + ' operated in the ' + era + ', shipping ' + pick(['hardware', 'software', 'services'], i) + ' to enterprise clients.',
          tags: ['vendor', slug(era)]
        };
      } else if (kind === 2) {
        var tname = pick(['Micro', 'Hyper', 'Meta', 'Neo', 'Ultra', 'Sync', 'Flex', 'Core'], i) + ' ' + pick(TECH_WORDS, i);
        var tid = slug(tname);
        if (seen[tid]) { i++; continue; }
        node = {
          id: tid,
          label: tname,
          type: 'technology',
          year: year,
          summary: tname + ' introduced in ' + year + ' as part of the ' + era + ' toolchain.',
          tags: ['tech', slug(era)]
        };
      } else if (kind === 3) {
        var ename = pick(['Summit', 'Expo', 'Symposium', 'Launch', 'Demo Day', 'Hackathon'], i) + ' ' + year;
        var eid = slug(ename);
        if (seen[eid]) { i++; continue; }
        node = {
          id: eid,
          label: ename,
          type: 'event',
          year: year,
          summary: 'Industry gathering in ' + year + ' highlighting advances of the ' + era + '.',
          tags: ['event', slug(era)]
        };
      } else {
        var xname = pick(CONCEPT_WORDS, i);
        var xid = slug(xname + '-' + (2000 + (i % 26)));
        if (seen[xid]) { i++; continue; }
        node = {
          id: xid,
          label: xname,
          type: 'concept',
          year: 1950 + (i % 75),
          summary: 'Theoretical and practical notion of ' + xname.toLowerCase() + ' explored during the ' + era + '.',
          tags: ['theory', slug(era)]
        };
      }

      nodes.push(node);
      seen[node.id] = true;
      i++;
    }

    return nodes;
  }

  function buildEdges(nodes) {
    var edges = [];
    var byType = { person: [], company: [], technology: [], event: [], concept: [] };
    var byId = {};
    nodes.forEach(function (n) {
      byId[n.id] = n;
      byType[n.type].push(n);
    });

    var coreLinks = [
      ['lovelace', 'analytical-engine', 'documented'],
      ['babbage', 'analytical-engine', 'designed'],
      ['hollerith', 'ibm', 'founded lineage'],
      ['mauchly', 'eniac', 'built'],
      ['eckert', 'eniac', 'built'],
      ['turing', 'turing-machine', 'formalized'],
      ['von-neumann', 'stored-program', 'architected'],
      ['stored-program', 'edsac', 'implemented in'],
      ['grace-hopper', 'cobol', 'led'],
      ['ken-thompson', 'unix', 'created'],
      ['dennis-ritchie', 'c-language', 'created'],
      ['dennis-ritchie', 'unix', 'co-created'],
      ['c-language', 'unix', 'rewrote'],
      ['cerf', 'tcp-ip', 'co-designed'],
      ['kahn', 'tcp-ip', 'co-designed'],
      ['arpanet', 'internet-born', 'enabled'],
      ['tcp-ip', 'internet-born', 'standardized'],
      ['xerox-parc', 'alto', 'developed'],
      ['xerox-parc', 'smalltalk', 'developed'],
      ['jobs', 'apple', 'co-founded'],
      ['wozniak', 'apple', 'co-founded'],
      ['apple', 'macintosh', ' shipped'],
      ['mac-launch', 'macintosh', 'introduced'],
      ['gates', 'microsoft', 'co-founded'],
      ['microsoft', 'basic-ms', 'published'],
      ['basic-ms', 'altair', 'ran on'],
      ['microsoft', 'dos', 'licensed'],
      ['ibm', 'ibm-pc', 'launched'],
      ['dos', 'ibm-pc', 'powered'],
      ['microsoft', 'windows-1', 'released'],
      ['stallman', 'gnu', 'started'],
      ['torvalds', 'linux', 'created'],
      ['gnu', 'linux', 'paired with'],
      ['berners-lee', 'www', 'invented'],
      ['www', 'html', 'uses'],
      ['www', 'http', 'uses'],
      ['mosaic', 'netscape', 'spawned'],
      ['page-brin', 'google', 'founded'],
      ['amazon', 'aws', 'launched'],
      ['iphone', 'smartphone-era', 'triggered'],
      ['apple', 'iphone', 'released'],
      ['google', 'android', 'acquired'],
      ['openai', 'chatgpt-launch', 'drove'],
      ['transformers', 'deep-learning', 'advanced'],
      ['transformers', 'chatgpt-launch', 'enabled'],
      ['codd', 'relational-db', 'invented'],
      ['relational-db', 'sql', 'queried by'],
      ['oracle', 'sql', 'commercialized'],
      ['intel', '4004', 'fabricated'],
      ['moores-law', 'intel', 'observed at'],
      ['nvidia', 'cuda', 'developed'],
      ['cuda', 'imagenet-moment', 'accelerated'],
      ['imagenet-moment', 'deep-learning', 'revived'],
      ['python-lang', 'deep-learning', 'popular in'],
      ['javascript', 'nodejs', 'extended by'],
      ['react', 'javascript', 'built with'],
      ['torvalds', 'git', 'created'],
      ['github', 'git', 'hosts'],
      ['bitcoin', 'blockchain', 'uses'],
      ['postgres', 'relational-db', 'implements'],
      ['mysql', 'relational-db', 'implements']
    ];

    coreLinks.forEach(function (l) {
      if (byId[l[0]] && byId[l[1]]) {
        edges.push({ source: l[0], target: l[1], relation: l[2] });
      }
    });

    function link(a, b, relation) {
      if (a && b && a.id !== b.id) {
        edges.push({ source: a.id, target: b.id, relation: relation });
      }
    }

    // Era anchoring
    ERAS.forEach(function (era, idx) {
      var eraNode = byId[slug(era.name)];
      if (!eraNode) return;
      nodes.forEach(function (n) {
        if (n.year >= era.start && n.year <= era.end && n.id !== eraNode.id) {
          if ((n.id.charCodeAt(0) + idx) % 7 === 0) link(n, eraNode, 'occurred in');
        }
      });
    });

    // Type-structured random links (deterministic)
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.type === 'person') {
        link(n, pick(byType.company, i), 'worked at');
        link(n, pick(byType.technology, i + 5), 'contributed to');
        if (i % 3 === 0) link(n, pick(byType.concept, i + 2), 'advocated');
      } else if (n.type === 'company') {
        link(n, pick(byType.technology, i + 1), 'developed');
        link(n, pick(byType.person, i + 4), 'employed');
        if (i % 4 === 0) link(n, pick(byType.company, i + 7), 'partnered with');
      } else if (n.type === 'technology') {
        link(n, pick(byType.concept, i), 'embodies');
        link(n, pick(byType.technology, i + 3), 'extends');
        if (i % 5 === 0) link(n, pick(byType.event, i), 'debuted at');
      } else if (n.type === 'event') {
        link(n, pick(byType.technology, i + 2), 'featured');
        link(n, pick(byType.person, i + 6), 'hosted');
      } else if (n.type === 'concept') {
        link(n, pick(byType.technology, i + 1), 'influenced');
        link(n, pick(byType.concept, i + 4), 'relates to');
      }
    }

    // Deduplicate undirected pairs
    var keySet = {};
    edges = edges.filter(function (e) {
      var key = [e.source, e.target].sort().join('|') + '|' + e.relation;
      if (keySet[key]) return false;
      keySet[key] = true;
      return byId[e.source] && byId[e.target];
    });

    return edges;
  }

  var nodes = buildNodes();
  var edges = buildEdges(nodes);

  window.KG_DATA = {
    types: TYPES,
    typeLabels: {
      person: 'Person',
      company: 'Company',
      technology: 'Technology',
      event: 'Event',
      concept: 'Concept'
    },
    nodes: nodes,
    edges: edges
  };
})();
