/**
 * netlify/functions/permit-assistant/index.mts
 */
import type { Context } from "@netlify/functions";
import OpenAI from "openai";

/**
 * Create the OpenAI client with your API key.
 * Make sure `OPENAI_API_KEY` is set in your Netlify environment variables.
 */
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * The “system” message used to prime the conversation
 * with instructions about how to answer. 
 */
const residentialSystemMessage = `You are a specialized permitting assistant for residential construction projects. Your goal is to determine the exact permit type needed, identify required documentation, and collect necessary information to generate the appropriate permit application form.

CONVERSATION STRATEGY:
1. Begin by asking ONE broad question about the general nature of their project
2. Based on their response, ask targeted follow-up questions ONE AT A TIME to narrow down the specific permit category
3. Only ask for information relevant to the permit type you've identified
4. Maintain a conversational, helpful tone while systematically gathering required information
5. Once you've gathered sufficient information to determine the permit type with high confidence (90%+), set assessment_complete to true
6. Provide specific, accurate information about fees, requirements, and documentation

IMPORTANT: Do NOT ask for basic contact information, address, or property owner details as those are handled separately in the form.

PERMIT TYPE DETERMINATION FLOW:
- For mentions of "new home", "new house", or similar => New Residential Construction
- For mentions of "addition", "adding room", "extending" => Residential Addition
- For mentions of "renovate", "remodel", "update interior" => Residential Remodel
- For mentions of "electrical", "wiring", "panel", "outlets" => Residential Electrical
- For mentions of "plumbing", "pipes", "water heater" => Residential Plumbing
- For mentions of "HVAC", "air conditioning", "heating", "furnace" => Residential HVAC
- For mentions of "shed", "detached garage", "workshop" => Residential Accessory Building
- For mentions of "pool", "swimming" => Residential Swimming Pool
- For mentions of "storm shelter", "tornado shelter", "safe room" => Residential Storm Shelter
- For mentions of "solar", "PV", "photovoltaic" => Residential Solar PV
- For mentions of "generator", "backup power" => Residential Generator
- For mentions of "sprinkler", "irrigation" => Residential Irrigation
- For mentions of "fence" => Residential Fence
- For mentions of "roof", "shingles", "roofing" => Residential Roof
- For mentions of "windows", "doors", "replacement" => Window/Door Replacement
- For mentions of "driveway", "patio", "concrete slab" => Residential Concrete

REQUIRED DETAILS BY PERMIT TYPE:

For NEW CONSTRUCTION:
- Square footage
- Number of stories
- Number of bedrooms/bathrooms
- Construction value estimate
- Required documents: Complete structural plans, foundation plans, MEP plans
- Fee structure: Usually 3% of construction value

For ADDITION:
- Square footage of addition
- Addition type (bedroom, bathroom, etc.)
- Whether load-bearing walls are affected
- Construction value estimate
- Required documents: Floor plans, structural details if load-bearing
- Fee structure: Usually 2.5% of construction value

For REMODEL:
- Estimated project cost (Only needed if >$10,000)
- Whether walls are being removed
- Whether room use is changing
- Required documents: Floor plans showing before/after if walls changing
- Fee structure: Usually 2% of construction value, minimum $100

For ELECTRICAL:
- Type of electrical work (panel upgrade, new circuits, etc.)
- Whether homeowner or licensed electrician will do the work
- If homeowner, whether they've passed required test
- Required documents: Electrical diagram for major work
- Fee structure: Usually $80 base fee plus per-circuit charges

For PLUMBING:
- Type of plumbing work
- Whether there will be slab penetrations
- Name of licensed plumber
- Required documents: Plumbing diagram for major work
- Fee structure: Usually $80 base fee plus per-fixture charges

For HVAC:
- Type of HVAC work (replacement, new installation)
- Equipment energy efficiency rating
- Required documents: Equipment specifications
- Fee structure: Usually $80 base fee

For ACCESSORY BUILDING:
- Square footage of structure
- Whether utilities will be installed
- Distance from main structure and property lines
- Required documents: Site plan, building plans if >200 sq ft
- Fee structure: Usually value-based, similar to additions

For SWIMMING POOL:
- Pool type (in-ground or above-ground)
- Pool dimensions
- Required documents: Site plan, barrier/fence details, electrical details
- Fee structure: Usually fixed fee of $150-250 depending on pool type

For STORM SHELTER:
- Shelter type (above or below ground)
- Occupant capacity
- Required documents: Manufacturer specifications or engineering plans
- Fee structure: Usually fixed fee of $100-150

For SOLAR PV:
- Mounting location (roof or ground)
- System size (kW)
- Required documents: Panel specifications, structural assessment for roof mounting
- Fee structure: Usually fixed fee of $150 plus potential value-based component

For GENERATOR:
- Permanent or portable installation
- Fuel type
- Distance from windows and doors
- Required documents: Manufacturer specifications, site plan
- Fee structure: Usually fixed fee of $100-150

For IRRIGATION:
- Connection to municipal water or well
- Required documents: Backflow prevention details, system layout
- Fee structure: Usually fixed fee of $80

For FENCE:
- Fence height
- Fence location (front yard, side yard, back yard)
- Fence material
- Required documents: Site plan or property survey recommended
- Fee structure: Usually fixed fee of $50

For ROOF:
- Full replacement or partial (>100 sq ft requires permit)
- Roofing material
- Required documents: Material specifications
- Fee structure: Usually $75 minimum or $0.05 per square foot

For WINDOW/DOOR REPLACEMENT:
- Number of windows/doors being replaced
- Whether opening sizes are being changed
- Required documents: Window/door specifications
- Fee structure: Usually fixed fee of $50 unless changing structural openings

For CONCRETE:
- Type of concrete work (driveway, sidewalk, patio)
- Square footage of concrete
- Whether drainage patterns will be affected
- Required documents: Site plan
- Fee structure: Usually fixed fee of $75-100

GENERAL GUIDELINES ON CONTRACTOR REQUIREMENTS:
- Electrical work typically requires a licensed electrician unless homeowner qualifies
- Plumbing work typically requires a licensed plumber
- HVAC work typically requires a licensed HVAC contractor
- Structural work affecting load-bearing elements typically requires a licensed general contractor
- Specialized work (pools, solar, etc.) often requires specialty licensed contractors

SPECIAL INSTRUCTIONS:
1. Always provide specific details about required documents
2. Provide accurate fee estimates based on the information gathered
3. Indicate when engineering letters or specialized approvals may be needed
4. If the project might require multiple permits, identify each one
5. When the assessment is complete (90%+ confidence), provide a clear summary of the permit requirements and set assessment_complete to true

CRITICAL: You MUST map the permit_type to one of these exact values in your final assessment:
"new_construction", "addition", "remodel", "electrical", "plumbing", "hvac", "accessory_building", "swimming_pool", "storm_shelter", "solar", "generator", "irrigation", "fence", "roof", "windows_doors", "concrete"

Format all responses following the schema requirements exactly as specified, with proper values for all fields.`;


/**
 * Wrap your JSON schema in a top-level { strict: true, schema: { ... } }
 * per OpenAI’s “structured outputs” spec.
 */
const residentialPermitSchemaWrapper = {
    name: "residentialPermitSchema", // Required name field added
    strict: true,
    schema: {
        type: "object",
        properties: {
            message: {
                type: "string",
                description: "The next message to display to the user in the chat"
            },
            assessment_complete: {
                type: "boolean",
                description: "Whether the assessment is complete and form should be populated"
            },
            permit_details: {
                type: "object",
                properties: {
                    permit_type: {
                        type: "string",
                        enum: [
                            "new_construction",
                            "addition",
                            "remodel",
                            "electrical",
                            "plumbing",
                            "hvac",
                            "accessory_building",
                            "swimming_pool",
                            "storm_shelter",
                            "solar",
                            "generator",
                            "irrigation",
                            "fence",
                            "roof",
                            "windows_doors",
                            "concrete"
                        ],
                        description: "The specific type of residential permit required"
                    },
                    project_description: {
                        type: "string",
                        description: "Brief description of the project"
                    },
                    square_footage: {
                        type: "number",
                        description: "Total square footage of the project area"
                    },
                    estimated_value: {
                        type: "number",
                        description: "Estimated value/cost of the project in USD"
                    },
                    stories: {
                        type: "integer",
                        description: "Number of stories in the structure"
                    },
                    bedrooms: {
                        type: "integer",
                        description: "Number of bedrooms (for new construction)"
                    },
                    bathrooms: {
                        type: "number",
                        description: "Number of bathrooms (for new construction)"
                    },
                    addition_type: {
                        type: "string",
                        enum: ["bedroom", "bathroom", "kitchen", "living_space", "porch", "other"],
                        description: "Type of addition being constructed"
                    },
                    affects_load_bearing: {
                        type: "string",
                        enum: ["yes", "no", "unknown"],
                        description: "Whether the project affects load-bearing walls"
                    },
                    walls_removed: {
                        type: "string",
                        enum: ["yes", "no"],
                        description: "Whether walls will be removed as part of the remodel"
                    },
                    room_use_change: {
                        type: "string",
                        enum: ["yes", "no"],
                        description: "Whether room use is changing"
                    },
                    electrical_work_type: {
                        type: "string",
                        enum: ["panel_upgrade", "new_circuits", "rewiring", "new_service", "other"],
                        description: "Type of electrical work being performed"
                    },
                    electrical_performed_by: {
                        type: "string",
                        enum: ["homeowner", "electrician"],
                        description: "Who will perform the electrical work"
                    },
                    homeowner_test: {
                        type: "string",
                        enum: ["yes", "no"],
                        description: "Whether homeowner has passed required test (if applicable)"
                    },
                    electrician_name: {
                        type: "string",
                        description: "Name of electrician (if applicable)"
                    },
                    electrician_license: {
                        type: "string",
                        description: "License number of electrician (if applicable)"
                    },
                    plumbing_work_type: {
                        type: "string",
                        enum: ["water_heater", "fixtures", "pipe_replacement", "slab_penetration", "other"],
                        description: "Type of plumbing work being performed"
                    },
                    hvac_work_type: {
                        type: "string",
                        enum: ["new_installation", "replacement", "ductwork", "other"],
                        description: "Type of HVAC work being performed"
                    },
                    accessory_building_type: {
                        type: "string",
                        enum: ["garage", "shed", "workshop", "pool_house", "other"],
                        description: "Type of accessory building"
                    },
                    pool_type: {
                        type: "string",
                        enum: ["in_ground", "above_ground"],
                        description: "Type of swimming pool"
                    },
                    pool_dimensions: {
                        type: "string",
                        description: "Dimensions of the pool"
                    },
                    shelter_type: {
                        type: "string",
                        enum: ["above_ground", "below_ground"],
                        description: "Type of storm shelter"
                    },
                    solar_mounting: {
                        type: "string",
                        enum: ["roof_mounted", "ground_mounted"],
                        description: "Mounting location for solar panels"
                    },
                    system_size_kw: {
                        type: "number",
                        description: "Size of solar system in kilowatts"
                    },
                    generator_type: {
                        type: "string",
                        enum: ["permanent", "portable"],
                        description: "Type of generator installation"
                    },
                    generator_fuel: {
                        type: "string",
                        enum: ["natural_gas", "propane", "diesel", "gasoline"],
                        description: "Fuel type for generator"
                    },
                    water_connection: {
                        type: "string",
                        enum: ["municipal", "well"],
                        description: "Water source for irrigation system"
                    },
                    fence_height: {
                        type: "number",
                        description: "Height of fence in feet"
                    },
                    fence_material: {
                        type: "string",
                        enum: ["wood", "chain_link", "vinyl", "wrought_iron", "other"],
                        description: "Material of fence"
                    },
                    fence_location: {
                        type: "array",
                        items: {
                            type: "string",
                            enum: ["front_yard", "side_yard", "back_yard"]
                        },
                        description: "Location(s) of fence on property"
                    },
                    roof_replacement_type: {
                        type: "string",
                        enum: ["full_replacement", "partial"],
                        description: "Type of roof replacement"
                    },
                    roofing_material: {
                        type: "string",
                        enum: ["asphalt", "metal", "tile", "wood", "other"],
                        description: "Type of roofing material"
                    },
                    windows_doors_count: {
                        type: "integer",
                        description: "Number of windows/doors being replaced"
                    },
                    changing_opening_size: {
                        type: "string",
                        enum: ["yes", "no"],
                        description: "Whether opening sizes are being changed"
                    },
                    concrete_type: {
                        type: "string",
                        enum: ["driveway", "sidewalk", "patio", "foundation", "other"],
                        description: "Type of concrete work"
                    },
                    affects_drainage: {
                        type: "string",
                        enum: ["yes", "no", "unknown"],
                        description: "Whether the project affects drainage patterns"
                    },
                    requires_licensed_contractor: {
                        type: "boolean",
                        description: "Whether a licensed contractor is required"
                    },
                    contractor_types: {
                        type: "array",
                        items: {
                            type: "string",
                            enum: [
                                "general_contractor",
                                "electrician",
                                "plumber",
                                "hvac",
                                "roofing",
                                "concrete",
                                "pool",
                                "solar"
                            ]
                        },
                        description: "Types of contractors required"
                    },
                    fee_type: {
                        type: "string",
                        enum: ["fixed", "square_footage_based", "value_based", "combined"],
                        description: "Method of calculating permit fee"
                    },
                    fee_amount: {
                        type: "number",
                        description: "Estimated fee amount"
                    },
                    fee_notes: {
                        type: "string",
                        description: "Additional notes about the fee calculation"
                    },
                    required_documents: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                document_type: {
                                    type: "string",
                                    enum: [
                                        "site_plan",
                                        "floor_plan",
                                        "elevation_drawings",
                                        "foundation_plan",
                                        "structural_plans",
                                        "electrical_plans",
                                        "plumbing_plans",
                                        "mechanical_plans",
                                        "energy_compliance_forms",
                                        "engineering_letter",
                                        "manufacturer_specifications",
                                        "property_survey"
                                    ],
                                    description: "Type of document required"
                                },
                                description: {
                                    type: "string",
                                    description: "Description of what the document should contain"
                                },
                                required: {
                                    type: "boolean",
                                    description: "Whether the document is required"
                                }
                            },
                            required: ["document_type", "description", "required"],
                            additionalProperties: false
                        },
                        description: "Documents required for permit application"
                    }
                },
                required: [
                    "permit_type",
                    "project_description",
                    "square_footage",
                    "estimated_value",
                    "stories",
                    "bedrooms",
                    "bathrooms",
                    "addition_type",
                    "affects_load_bearing",
                    "walls_removed",
                    "room_use_change",
                    "electrical_work_type",
                    "electrical_performed_by",
                    "homeowner_test",
                    "electrician_name",
                    "electrician_license",
                    "plumbing_work_type",
                    "hvac_work_type",
                    "accessory_building_type",
                    "pool_type",
                    "pool_dimensions",
                    "shelter_type",
                    "solar_mounting",
                    "system_size_kw",
                    "generator_type",
                    "generator_fuel",
                    "water_connection",
                    "fence_height",
                    "fence_material",
                    "fence_location",
                    "roof_replacement_type",
                    "roofing_material",
                    "windows_doors_count",
                    "changing_opening_size",
                    "concrete_type",
                    "affects_drainage",
                    "requires_licensed_contractor",
                    "contractor_types",
                    "fee_type",
                    "fee_amount",
                    "fee_notes",
                    "required_documents"
                ],
                additionalProperties: false
            }
        },
        required: ["message", "assessment_complete", "permit_details"],
        additionalProperties: false
    }
};



/**
 * Export the Netlify Function as an async function that
 * responds to incoming requests.
 */
export default async function handler(req: Request, context: Context) {
    try {
        // Parse incoming POST data. Netlify automatically parses JSON if
        // the request has the right headers, but sometimes you'll do it manually:
        const { messages, permitType } = await req.json();

        // If permitType is not "residential", reject
        if (permitType !== "residential") {
            return new Response(
                JSON.stringify({
                    error: "Unsupported permitType. Only 'residential' is allowed.",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Construct conversation array
        const conversation = [
            { role: "system", content: residentialSystemMessage },
            ...messages,
        ];

        // Call the Chat Completions API using a model that supports structured outputs
        // (Examples: "o1-2024-12-17", "gpt-4o-2024-08-06", "gpt-4.5-preview-2025-02-27", etc.)
        const response = await openai.chat.completions.create({
            model: "o1",
            messages: conversation,
            response_format: {
                type: "json_schema",
                json_schema: residentialPermitSchemaWrapper,
            },
        });

        // Grab the structured output from the model
        const result = response.choices[0].message;

        // Return the response JSON to the client
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Error in permit-assistant:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
