const PERMISSIONS = {
    'admin': {
        stock:      ['CREATE', 'READ', 'UPDATE', 'DELETE'],
        production: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
        users:      ['CREATE', 'READ', 'UPDATE', 'DELETE'],
        stats:      ['READ'],
    },
    'chef_equipe': {
        stock:      ['READ', 'UPDATE'],
        production: ['CREATE', 'READ', 'UPDATE'],
        users:      [],
        stats:      ['READ'],
    },
    'responsable': {
        stock:      ['READ'],
        production: ['CREATE', 'READ', 'UPDATE'],  // sauf DELETE
        users:      [],
        stats:      [],
    },
    'lecteur': {
        stock:      ['READ'],
        production: ['READ'],
        users:      [],
        stats:      [],
    },
};

module.exports = PERMISSIONS;