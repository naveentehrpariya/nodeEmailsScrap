class APIFeatures { 
    constructor(query, queryString){ 
        this.query = query;
        this.queryString = queryString;
    }
 
    filter(){ 
        const QueryObject  = {...this.queryString}
 
        // REMOVE SORTING PARAMETERS FROM QUERY
        const excludeQueries = ['page', 'sort', 'limit', 'fields']
        excludeQueries.forEach(el => delete QueryObject[el]);
 
        // ORDER BY 
        let querySting = JSON.stringify(QueryObject);
        querySting = querySting.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
 
        // JSON.parse(querySting)
        this.query.find(JSON.parse(querySting));
        return this;
    }
 
    // SORTING
    sort() { 
        if(this.queryString.sort){
           this.query = this.query.sort(this.queryString.sort);
        } else { 
           this.query = this.query.sort("-createdAt");
        }
        return this
    }
 
    // SELECT DESIRED FIELDS
    limit_fields(){ 
        if(this.queryString.fields){
            const q = this.queryString.fields.split(',').join(' ');
            this.query = this.query.select(q); // Fix: Change from {q} to q
        } else { 
            this.query = this.query.select("-__v");
        }
        return this
    }
 
    // PAGINATE
    async paginate(){
        const page = this.queryString.page * 1 || 1;
        const limit = this.queryString.limit * 1 || 1000;
        const skip = (page - 1) * limit;
        const totalDocuments = await this.query.clone().countDocuments();
        this.query = this.query.skip(skip).limit(limit);
        const totalPages = Math.ceil(totalDocuments / limit);
        return { query: this.query, totalDocuments, page, limit, totalPages };
    }
 }
 module.exports = APIFeatures;
 