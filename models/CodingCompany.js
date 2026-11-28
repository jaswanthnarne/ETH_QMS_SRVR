const mongoose = require('mongoose');

const codingCompanySchema = new mongoose.Schema(
    {
        slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
        name: { type: String, required: [true, 'Company name is required'], trim: true },
        fullName: { type: String, trim: true, default: '' },
        category: {
            type: String,
            enum: ['service', 'product', 'startup', 'misc'],
            default: 'service'
        },
        categoryLabel: { type: String, trim: true, default: '' },
        tagline: { type: String, trim: true, default: '' },
        packageRange: { type: String, trim: true, default: '' },
        accentColor: { type: String, trim: true, default: '#5899B5' },
        logoUrl: { type: String, default: '' }, // http(s) URL or data:image/... URI
        website: { type: String, trim: true, default: '' },
        focusAreas: [{ type: String, trim: true }],
        description: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

codingCompanySchema.index({ category: 1, sortOrder: 1 });

module.exports = mongoose.model('CodingCompany', codingCompanySchema);
